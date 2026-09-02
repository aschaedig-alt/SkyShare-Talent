import { prisma } from "@/lib/prisma";
import { splitCandidateName } from "@/lib/candidates/normalize";
import { getTaskEmailConfig, type TaskEmailConfig } from "@/lib/onboarding/task-email-config";
import { fetchTemplate } from "./templates";

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

/**
 * Strip anything that could execute out of a body typed in the send dialog.
 *
 * Lifted verbatim in behaviour from cleanEditedBody() in orientation-email.ts —
 * the same job, on the same kind of contenteditable output, so it does the same
 * thing rather than inventing a second answer.
 */
export function cleanEditedBody(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*\/?\s*(script|style|iframe|object|embed)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript:/gi, "");
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
  /** True when the body below is a hand edit rather than the live template. */
  edited: boolean;
};

export type HireForTaskEmail = {
  id: string;
  name: string;
  personalEmail: string | null;
  ssEmail: string | null;
};

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
  bodyOverride?: string | null
): Promise<TaskEmailPreview> {
  const cfg = await getTaskEmailConfig(taskKey);
  if (!cfg) {
    throw new Error("This task is not set up to send an email. Turn it on in Manage tasks first.");
  }

  const { to, toSource, fellBack } = resolveRecipient(hire, cfg);
  const tpl = await fetchTemplate(cfg.templateId, cfg.templateName);

  const { firstName } = splitCandidateName(hire.name);
  const first = firstName || hire.name.split(/\s+/)[0] || "there";

  const edited = Boolean(bodyOverride && bodyOverride.trim());
  const bodyHtml = edited ? cleanEditedBody(bodyOverride as string) : tpl.body;
  const greeting = cfg.greeting ? greetingHtml(first) : "";

  return {
    taskKey,
    taskLabel,
    to,
    toSource,
    fellBack,
    cc: cfg.cc,
    firstName: first,
    subject: tpl.subject,
    greetingHtml: greeting,
    bodyHtml,
    html: greeting + bodyHtml,
    templateName: tpl.name,
    edited
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
