import { prisma } from "@/lib/prisma";
import { splitCandidateName } from "@/lib/candidates/normalize";
import { getTaskEmailConfig, type TaskEmailConfig } from "@/lib/onboarding/task-email-config";
import { formatCalendarDay, formatMomentDate } from "@/lib/dates/display";
import { fetchTemplate } from "./templates";
import { cleanEditedBody } from "./sanitize-body";

// The generic "this checklist task sends an email" path.
//
// It is the same shape as onboarding-email.ts and contacts-email.ts — the BODY
// LIVES IN FRONT and is fetched at send time, because HR edits the templates there
// and a copy kept in the app drifts silently. What is different is that the
// template is not hard-coded: it comes from whatever she picked for this task in
// Manage tasks (lib/onboarding/task-email-config.ts).
//
// Those two older modules are deliberately left alone. Each does something this
// one does not — the contacts email injects a freshly-read share link so a token
// rotation cannot strand a dead URL, and both carry their own send records that
// the history already reads. Folding them in would be a rewrite of working,
// load-bearing code to no end.

/** Front's editor labels this size "12" because 9pt and 12px are the same. Mirroring
 *  the template's own markup keeps the greeting from looking bolted on. */
function greetingHtml(firstName: string): string {
  const safe = firstName.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
  return (
    `<div style="line-height: 1.5;" dir="ltr">` +
    `<span style="font-family: Verdana, sans-serif;">` +
    `<span style="background-color: transparent; font-size: 9pt;">Hi ${safe},</span>` +
    `</span></div><div><br /></div>`
  );
}


export type TaskEmailPreview = {
  taskKey: string;
  taskLabel: string;
  /** A LIST, because a custom audience can name several. The two hire-address
   *  cases always resolve to exactly one. */
  to: string[];
  /** Which field the addresses came from, so the confirm dialog can say so. */
  toSource: "personal" | "company" | "custom";
  /** True when the address she picked was empty and the other one was used.
   *  Never true for a custom list, which does not fall back. */
  fellBack: boolean;
  cc: string[];
  firstName: string;
  subject: string;
  /** The per-recipient half. Empty when the template has its own greeting. */
  greetingHtml: string;
  /** The template body, resolved. This is the half the dialog lets her edit. */
  bodyHtml: string;
  /** greetingHtml + bodyHtml — what actually goes out. */
  html: string;
  templateName: string;
  /** The template this preview was actually built from — the configured one, or
   *  the one chosen in the dialog for this send. */
  templateId: string;
  /** True when a different template was picked for this send than the one the
   *  step is configured with. Shown in the dialog and recorded with the send, so
   *  "which template did that go out with" is answerable afterwards. */
  templateOverridden: boolean;
  /** True when the body below is a hand edit rather than the live template. */
  edited: boolean;
  /** A reminder to somebody else: sending it does not tick the step. */
  reminder: boolean;
};

export type HireForTaskEmail = {
  id: string;
  name: string;
  personalEmail: string | null;
  ssEmail: string | null;
  /** Optional, for the {{...}} fields a template can carry - see fillHireFields. */
  position?: string | null;
  startDate?: Date | string | null;
  orientationDate?: Date | string | null;
};

/**
 * Fill the hire's details into a template: {{name}}, {{first_name}},
 * {{position}}, {{start_date}}, {{orientation_date}} (any case, spaces allowed).
 *
 * A template used to go out word for word, which is fine when it is addressed to
 * the hire and useless when it is not: a reminder to accounting that a card is
 * needed has to say for WHOM. A field with no value is left as typed, so the
 * preview shows it and it can be filled in by hand before sending - never
 * silently dropped out of a sentence.
 */
function fillHireFields(text: string, hire: HireForTaskEmail, firstName: string, html: boolean): string {
  const values: Record<string, string | null> = {
    name: hire.name,
    first_name: firstName,
    position: hire.position?.trim() || null,
    start_date: hire.startDate ? formatCalendarDay(hire.startDate) : null,
    orientation_date: hire.orientationDate ? formatMomentDate(hire.orientationDate) : null
  };
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (whole, raw: string) => {
    const value = values[raw.toLowerCase()];
    if (!value) return whole;
    return html ? value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string) : value;
  });
}

function resolveRecipient(hire: HireForTaskEmail, cfg: TaskEmailConfig) {
  // A CUSTOM LIST IS NOT ABOUT THE HIRE AT ALL, so it neither reads their fields
  // nor falls back to them. The step it exists for ("2. PRD Request to ITS") is
  // addressed to IT; falling back to the pilot on an empty list would send an
  // internal request about somebody to that same somebody.
  if (cfg.audience === "custom") {
    const to = cfg.to.filter((a) => a.trim());
    if (!to.length) {
      throw new Error("This task is set to send to addresses you type in, but none are saved. Add them in Manage tasks.");
    }
    return { to, toSource: "custom" as const, fellBack: false };
  }
  const personal = hire.personalEmail?.trim() ?? "";
  const company = hire.ssEmail?.trim() ?? "";
  const first = cfg.audience === "company" ? company : personal;
  const second = cfg.audience === "company" ? personal : company;
  if (first) return { to: [first], toSource: cfg.audience, fellBack: false };
  if (second) {
    return { to: [second], toSource: cfg.audience === "company" ? ("personal" as const) : ("company" as const), fellBack: true };
  }
  throw new Error(`${hire.name} has no personal or SkyShare email on file — add one before sending.`);
}

/**
 * Build the exact email that would be sent. Used for BOTH the preview and the
 * send, so what she approves is what actually goes out.
 *
 * `bodyOverride` replaces the template body for THIS SEND ONLY and never the
 * greeting — the greeting is rebuilt per recipient, which is what keeps an edited
 * body safe to reuse. Nothing is written back to Front and the next send reads the
 * live template again. There is no cron path into this function; every send is a
 * person pressing a button in a dialog, which is the test for whether an edit box
 * is allowed at all (see the note on buildOrientationEmail).
 */
export async function buildTaskEmail(
  hire: HireForTaskEmail,
  taskKey: string,
  taskLabel: string,
  bodyOverride?: string | null,
  /**
   * Use a DIFFERENT Front template for this one send.
   *
   * Asked for on 2026-09-11, and the reasoning is better than the design it
   * replaces: "the document request, maintenance and pilot need a different
   * configuration... we can click the dropdown and choose from the templates. Why
   * cannot I do that on this one?" One step, two audiences - a maintenance hire
   * and a pilot need different document requests - and a single configured
   * template cannot express that.
   *
   * PER-SEND ONLY, never written back to the config, exactly like the editable
   * body. Picking the MX template for a maintenance hire must not make it the
   * default for the next pilot.
   */
  templateOverride?: string | null
): Promise<TaskEmailPreview> {
  const cfg = await getTaskEmailConfig(taskKey);
  if (!cfg) {
    throw new Error("This task is not set up to send an email. Turn it on in Manage tasks first.");
  }

  const { to, toSource, fellBack } = resolveRecipient(hire, cfg);
  const chosenId = templateOverride?.trim() || cfg.templateId;
  // The remembered NAME only helps when the id is the configured one. For an
  // override we have no remembered name, so fetchTemplate falls back to its
  // paginated name lookup only when it needs to.
  const tpl = await fetchTemplate(chosenId, chosenId === cfg.templateId ? cfg.templateName : undefined);

  const { firstName } = splitCandidateName(hire.name);
  const first = firstName || hire.name.split(/\s+/)[0] || "there";

  const edited = Boolean(bodyOverride && bodyOverride.trim());
  // A hand edit is final - it started from the already-filled body.
  const bodyHtml = edited ? cleanEditedBody(bodyOverride as string) : fillHireFields(tpl.body, hire, first, true);
  const greeting = cfg.greeting ? greetingHtml(first) : "";

  return {
    taskKey,
    taskLabel,
    to,
    toSource,
    fellBack,
    cc: cfg.cc,
    firstName: first,
    subject: fillHireFields(tpl.subject, hire, first, false),
    greetingHtml: greeting,
    bodyHtml,
    html: greeting + bodyHtml,
    templateName: tpl.name,
    templateId: chosenId,
    templateOverridden: Boolean(templateOverride && templateOverride.trim() && templateOverride.trim() !== cfg.templateId),
    edited,
    reminder: cfg.reminder
  };
}

// ---------------------------------------------------------------------------
// Send record. One WorkspaceSetting for all task emails, keyed hireId:taskKey —
// the same JSON-blob-not-a-migration trade the other two send paths made against
// this shared live database.

const SCOPE = "front";
const KEY = "task-email-sends";

export type TaskSendRecord = {
  conversationId?: string;
  messageId?: string;
  sentAt: string;
  /** Comma-joined when there is more than one, so a record written before custom
      recipients existed still reads exactly the same way. */
  to: string;
  sentBy?: string | null;
  /** Which send-guard mode was in force, so a redirected test send is not later
      mistaken for a real delivery to the address recorded above. */
  mode?: string;
  /** Whether the body was hand-edited for that send. Undefined on records written
      before this existed, which is a third state and not a "no". */
  edited?: boolean;
  templateName?: string;
};

type SendMap = Record<string, TaskSendRecord>;

function recordKey(hireId: string, taskKey: string): string {
  return `${hireId}:${taskKey}`;
}

async function readAll(): Promise<SendMap> {
  const row = await prisma.workspaceSetting.findUnique({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    select: { valueJson: true }
  });
  if (!row?.valueJson) return {};
  try {
    const parsed = JSON.parse(row.valueJson) as unknown;
    return (parsed && typeof parsed === "object" ? parsed : {}) as SendMap;
  } catch {
    return {};
  }
}

export async function getTaskSendRecord(hireId: string, taskKey: string): Promise<TaskSendRecord | null> {
  return (await readAll())[recordKey(hireId, taskKey)] ?? null;
}

/**
 * Every task-email send record, keyed "hireId:taskKey".
 *
 * One read for a whole page. The post-onboard grid draws a send button per
 * check-in per person, and asking per button would be one identical read of the
 * same JSON blob per cell.
 */
export async function getTaskSendMap(): Promise<Record<string, TaskSendRecord>> {
  return readAll();
}

/** Split that map into hireId -> taskKey -> sentAt, which is the shape a page
 *  hands to its buttons. */
export function taskSendsByHire(map: Record<string, TaskSendRecord>): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const [composite, rec] of Object.entries(map)) {
    const at = composite.indexOf(":");
    if (at <= 0 || !rec?.sentAt) continue;
    const hireId = composite.slice(0, at);
    const taskKey = composite.slice(at + 1);
    (out[hireId] ??= {})[taskKey] = rec.sentAt;
  }
  return out;
}

export async function recordTaskSend(hireId: string, taskKey: string, rec: TaskSendRecord): Promise<void> {
  const all = await readAll();
  all[recordKey(hireId, taskKey)] = rec;
  const value = JSON.stringify(all);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: value },
    update: { valueJson: value }
  });
}

// ---------------------------------------------------------------------------
// Skip record. "sometimes we might want to skip sending this out. give me the
// option to do that and show it was skipped." (Aimee, 2026-09-29, of the 30-day
// check-in email on the post-onboarding grid.) A skip sets the step to N/A - the
// status the checklist already uses for "not happening" - and this remembers who
// skipped it and when, which a bare N/A cannot say. Same one-blob store, and the
// same no-migration trade, as the send records above.

const SKIP_KEY = "task-email-skips";

export type TaskSkipRecord = { skippedAt: string; skippedBy?: string | null };

async function readSkips(): Promise<Record<string, TaskSkipRecord>> {
  const row = await prisma.workspaceSetting.findUnique({
    where: { scope_key: { scope: SCOPE, key: SKIP_KEY } },
    select: { valueJson: true }
  });
  if (!row?.valueJson) return {};
  try {
    const parsed = JSON.parse(row.valueJson) as unknown;
    return (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, TaskSkipRecord>;
  } catch {
    return {};
  }
}

async function writeSkips(all: Record<string, TaskSkipRecord>): Promise<void> {
  const value = JSON.stringify(all);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: SKIP_KEY } },
    create: { scope: SCOPE, key: SKIP_KEY, valueJson: value },
    update: { valueJson: value }
  });
}

export async function recordTaskSkip(hireId: string, taskKey: string, rec: TaskSkipRecord): Promise<void> {
  const all = await readSkips();
  all[recordKey(hireId, taskKey)] = rec;
  await writeSkips(all);
}

export async function clearTaskSkip(hireId: string, taskKey: string): Promise<void> {
  const all = await readSkips();
  if (!(recordKey(hireId, taskKey) in all)) return;
  delete all[recordKey(hireId, taskKey)];
  await writeSkips(all);
}

/** hireId -> taskKey -> the skip. One read for a whole grid. */
export async function getTaskSkipsByHire(): Promise<Record<string, Record<string, TaskSkipRecord>>> {
  const out: Record<string, Record<string, TaskSkipRecord>> = {};
  let all: Record<string, TaskSkipRecord> = {};
  try {
    all = await readSkips();
  } catch {
    // An unreadable log must not take the page down; a skipped step then reads N/A.
    return out;
  }
  for (const [composite, rec] of Object.entries(all)) {
    const at = composite.indexOf(":");
    if (at <= 0 || !rec?.skippedAt) continue;
    (out[composite.slice(0, at)] ??= {})[composite.slice(at + 1)] = rec;
  }
  return out;
}
