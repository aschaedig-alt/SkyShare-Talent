import { prisma } from "@/lib/prisma";
import { splitCandidateName } from "@/lib/candidates/normalize";
import { fetchTemplate } from "./templates";
import { cleanEditedBody } from "./sanitize-body";

// "Are you still owed anything?" — the email HR sends a traveler who paid for
// part of a trip themselves.
//
// Same shape as lib/front/task-email.ts: the BODY LIVES IN FRONT and is fetched
// at send time, because HR edits the templates there and a copy kept in the app
// drifts silently.
//
// WHAT IS DIFFERENT, AND IT IS THE WHOLE POINT OF THIS MODULE: the template does
// not exist yet. Her words, 2026-09-10: "i havent make the template yet but i
// will so lets build this part." So there is NO hard-coded rsp_ id anywhere in
// here — which template to send is a WorkspaceSetting she picks in the send
// window, exactly like a checklist task's template is picked in Manage tasks.
// The day she creates it in Front it appears in that list and this works, with no
// deploy and no code change. Hard-coding the id (the way contacts-email.ts does)
// would have meant shipping a feature that could not run until somebody edited a
// source file, which is the one thing she asked it not to be.
//
// IT DOES NOT TOUCH THE REIMBURSEMENT STAGE. The stages are NOT_STARTED →
// SUBMITTED → TRAVELER_TOLD → PAYMENT_CONFIRMED → TRAVELER_CONFIRMED
// (lib/travel/checklist.ts), and "are you still owed anything" is none of them —
// it is the question you ask BEFORE you know whether there is anything to submit.
// The send is recorded here and shown as "Asked <date>"; where the trip has got
// to stays hers to set.

/** Front's editor labels this size "12" because 9pt and 12px are the same.
 *  Mirroring the template's own markup keeps the greeting from looking bolted on.
 *  Copied from lib/front/task-email.ts rather than shared: that one is private to
 *  a module with its own config shape, and six lines of markup is a cheaper
 *  duplicate than a refactor of a load-bearing send path. */
function greetingHtml(firstName: string): string {
  const safe = firstName.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
  return (
    `<div style="line-height: 1.5;" dir="ltr">` +
    `<span style="font-family: Verdana, sans-serif;">` +
    `<span style="background-color: transparent; font-size: 9pt;">Hi ${safe},</span>` +
    `</span></div><div><br /></div>`
  );
}

// ---------------------------------------------------------------------------
// Which template. Data, not code — see the header.

const SCOPE = "front";
const TEMPLATE_KEY = "travel-reimbursement-template";

export type ReimbursementTemplateConfig = {
  templateId: string;
  /** Remembered so fetchTemplate can recover by name when Front hands the
   *  template a new id (rebuilding one in Front does exactly that). */
  templateName: string;
  cc: string[];
};

export async function getReimbursementTemplate(): Promise<ReimbursementTemplateConfig | null> {
  const row = await prisma.workspaceSetting.findUnique({
    where: { scope_key: { scope: SCOPE, key: TEMPLATE_KEY } },
    select: { valueJson: true }
  });
  if (!row?.valueJson) return null;
  try {
    const parsed = JSON.parse(row.valueJson) as Partial<ReimbursementTemplateConfig> | null;
    if (!parsed || typeof parsed.templateId !== "string" || !parsed.templateId.trim()) return null;
    return {
      templateId: parsed.templateId,
      templateName: typeof parsed.templateName === "string" ? parsed.templateName : parsed.templateId,
      cc: Array.isArray(parsed.cc) ? parsed.cc.filter((a): a is string => typeof a === "string") : []
    };
  } catch {
    return null;
  }
}

export async function setReimbursementTemplate(cfg: ReimbursementTemplateConfig): Promise<void> {
  const value = JSON.stringify(cfg);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: TEMPLATE_KEY } },
    create: { scope: SCOPE, key: TEMPLATE_KEY, valueJson: value },
    update: { valueJson: value }
  });
}

// ---------------------------------------------------------------------------
// Building the email.

/** A trip's traveler is a NewHire OR a Candidate — a trip can be attached to
 *  either, and a candidate has no NewHire row at all. So this takes the flattened
 *  shape rather than a hire, which is why buildTaskEmail could not be reused. */
export type TravelerForReimbursementEmail = {
  kind: "hire" | "candidate";
  name: string;
  /** NewHire.ssEmail. Always null for a candidate. */
  companyEmail: string | null;
  /** NewHire.personalEmail, or Candidate.primaryEmail. */
  personalEmail: string | null;
};

export type ReimbursementEmailPreview = {
  to: string[];
  /** Which field the address came from, so the dialog can say so. */
  toSource: "company" | "personal";
  /** True when the preferred address was empty and the other one was used. */
  fellBack: boolean;
  cc: string[];
  firstName: string;
  subject: string;
  /** The per-recipient half, built from their NAME. Never editable. */
  greetingHtml: string;
  /** The template body, resolved. This is the half the dialog lets her edit. */
  bodyHtml: string;
  /** greetingHtml + bodyHtml — what actually goes out. */
  html: string;
  templateId: string;
  templateName: string;
  /** True when the body is a hand edit rather than the live template. */
  edited: boolean;
};

/**
 * COMPANY ADDRESS FIRST for a hire — the same call contacts-email.ts makes, for
 * the same reason inverted in time: by the point we owe somebody money for a trip
 * they have already travelled on, they are employed and reading a SkyShare inbox.
 * A candidate has no company address, so theirs is the only one there is.
 */
function resolveRecipient(traveler: TravelerForReimbursementEmail): {
  to: string[];
  toSource: "company" | "personal";
  fellBack: boolean;
} {
  const company = traveler.companyEmail?.trim() ?? "";
  const personal = traveler.personalEmail?.trim() ?? "";

  if (traveler.kind === "hire") {
    if (company) return { to: [company], toSource: "company", fellBack: false };
    if (personal) return { to: [personal], toSource: "personal", fellBack: true };
    throw new Error(
      `${traveler.name} has no SkyShare or personal email on file — add one to their record before sending.`
    );
  }

  if (personal) return { to: [personal], toSource: "personal", fellBack: false };
  throw new Error(`${traveler.name} has no email address on file — add one to their candidate record before sending.`);
}

/**
 * Build the exact email that would be sent. Used for BOTH the preview and the
 * send, so what she approves is what actually goes out.
 *
 * `bodyOverride` replaces the template body for THIS SEND ONLY and never the
 * greeting — the greeting is rebuilt from the traveler's own name, which is what
 * keeps an edited body safe to reuse and what makes "send it to me first" show
 * the real "Hi Charlie,". Nothing is written back to Front and the next send
 * reads the live template again. There is no cron path into this function; every
 * send is a person pressing a button in a dialog, which is the test for whether
 * an edit box is allowed at all.
 */
export async function buildTravelReimbursementEmail(
  traveler: TravelerForReimbursementEmail,
  bodyOverride?: string | null
): Promise<ReimbursementEmailPreview> {
  const cfg = await getReimbursementTemplate();
  if (!cfg) {
    throw new Error(
      "No Front template is picked for this email yet. Choose one below — if it is not in the list, create it in Front first and reopen this window."
    );
  }

  const { to, toSource, fellBack } = resolveRecipient(traveler);
  const tpl = await fetchTemplate(cfg.templateId, cfg.templateName);

  const { firstName } = splitCandidateName(traveler.name);
  const first = firstName || traveler.name.split(/\s+/)[0] || "there";

  const edited = Boolean(bodyOverride && bodyOverride.trim());
  const bodyHtml = edited ? cleanEditedBody(bodyOverride as string) : tpl.body;
  const greeting = greetingHtml(first);

  return {
    to,
    toSource,
    fellBack,
    cc: cfg.cc,
    firstName: first,
    subject: tpl.subject,
    greetingHtml: greeting,
    bodyHtml,
    html: greeting + bodyHtml,
    templateId: tpl.id,
    templateName: tpl.name,
    edited
  };
}

// ---------------------------------------------------------------------------
// Send record. Its OWN WorkspaceSetting, keyed by trip.
//
// Deliberately NOT written into the trip's checklist blob: lib/travel/
// checklist-store.ts is a read-modify-write of one shared row and warns in its
// own comments about clobbering a concurrent edit. A send is not a checklist
// tick, and putting it there would make recording an email able to lose
// somebody's checkbox.

const SENDS_KEY = "travel-reimbursement-sends";

export type ReimbursementSendRecord = {
  // Optional because Front answers 202 and returns the ids it created, but the
  // shape is not guaranteed — so neither id is treated as certain.
  conversationId?: string;
  messageId?: string;
  sentAt: string;
  to: string;
  sentBy?: string | null;
  /** Which send-guard mode was in force, so a redirected dev send is not later
   *  mistaken for a real delivery to the address recorded above. */
  mode?: string;
  /** Whether the body was hand-edited for that send. Undefined on records written
   *  before this existed, which is a third state and not a "no". */
  edited?: boolean;
  templateName?: string;
};

type SendMap = Record<string, ReimbursementSendRecord>;

async function readAllSends(): Promise<SendMap> {
  const row = await prisma.workspaceSetting.findUnique({
    where: { scope_key: { scope: SCOPE, key: SENDS_KEY } },
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

export async function getReimbursementSendRecord(tripId: string): Promise<ReimbursementSendRecord | null> {
  return (await readAllSends())[tripId] ?? null;
}

export async function recordReimbursementSend(tripId: string, rec: ReimbursementSendRecord): Promise<void> {
  const all = await readAllSends();
  all[tripId] = rec;
  const value = JSON.stringify(all);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: SENDS_KEY } },
    create: { scope: SCOPE, key: SENDS_KEY, valueJson: value },
    update: { valueJson: value }
  });
}
