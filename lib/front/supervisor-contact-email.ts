import { prisma } from "@/lib/prisma";
import { splitCandidateName } from "@/lib/candidates/normalize";
import { resolveSupervisors } from "./orientation-email";
import { fetchTemplate } from "./templates";
import { cleanEditedBody } from "./sanitize-body";

// The REVERSE of the contacts-link email.
//
// Asked for 2026-09-10: "we have the option to send new hires the commonly used
// contacts they will need. i want to have the same option in reverse. when a new
// hire signs their offer letter, i want to be able to send their contact info to
// their supervisor."
//
// So: contacts-email.ts hands the new hire a link to the staff directory; this
// hands the new hire's own card — name, title, mobile, SkyShare email — to the
// one or two people who will manage them.
//
// THREE THINGS ARE DIFFERENT FROM THE OTHER SENDS, and each is deliberate.
//
// 1. THE TEMPLATE IS A SETTING, NOT A CONSTANT. contacts-email.ts pastes an rsp_
//    id into the source (CONTACTS_TEMPLATE_ID), which means a template that does
//    not exist yet surfaces as a raw 404 from Front and only a deploy can fix it.
//    No template has been written for this email yet, so hard-coding one would
//    ship a button that cannot work. The id lives in a WorkspaceSetting instead
//    and is picked from the live Front list inside the send dialog — she can turn
//    the whole feature on the moment she writes the template, with no release.
//
// 2. THE RECIPIENT IS NOT THE HIRE. It is resolved by resolveSupervisors() from
//    lib/front/orientation-email.ts — the SAME resolver the orientation
//    supervisors digest uses, imported rather than re-written, so a hire linked
//    to a supervisor record keeps reading that supervisor's address live and a
//    changed address can never go stale here while being right there.
//
// 3. THE DETAILS ARE APPENDED, NOT SUBSTITUTED. The contacts email REPLACES any
//    link in the template body because a stale share link is an active hazard.
//    There is no equivalent here — nothing in the template can go stale — so the
//    hire's card is appended to whatever the template says, in the template's own
//    Verdana/9pt. No token syntax to learn and nothing silently rewritten.
//
// WHAT THIS DOES NOT DO: send itself. See the note on the checklist key in
// lib/onboarding/tasks.ts — somebody's personal mobile number is in this email,
// and every Front send in this app is a person pressing a button in a confirm
// dialog after reading exactly what is going out.

const SCOPE = "front";
const TEMPLATE_KEY = "supervisor-contact-template";
const SENDS_KEY = "supervisor-contact-sends";

/** hrotasks@ is copied on every hand-built send, same as the other two. */
const CC = ["hrotasks@skyshare.com"];

function esc(value: string): string {
  return value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

// Matches greetingHtml in contacts-email.ts and task-email.ts. Front's editor
// labels this size "12" because 9pt and 12px are the same; mirroring the
// template's own markup keeps the greeting from looking bolted on.
function greetingHtml(firstName: string): string {
  return (
    `<div style="line-height: 1.5;" dir="ltr">` +
    `<span style="font-family: Verdana, sans-serif;">` +
    `<span style="background-color: transparent; font-size: 9pt;">Hi ${esc(firstName)},</span>` +
    `</span></div><div><br /></div>`
  );
}

// ---------------------------------------------------------------------------
// Which Front template this step uses.

export type SupervisorContactTemplate = { templateId: string; templateName: string };

/**
 * The template this email is built from, or null when one has not been chosen.
 *
 * Null is a normal state, not a fault: the feature ships before the template is
 * written, and the send dialog offers a picker of the live Front list so the
 * first person who needs it can choose one. Callers must treat null as "not set
 * up yet" and say so, rather than reporting a Front error nobody caused.
 */
export async function getSupervisorContactTemplate(): Promise<SupervisorContactTemplate | null> {
  const row = await prisma.workspaceSetting.findUnique({
    where: { scope_key: { scope: SCOPE, key: TEMPLATE_KEY } },
    select: { valueJson: true },
  });
  if (!row?.valueJson) return null;
  try {
    const parsed = JSON.parse(row.valueJson) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    if (typeof o.templateId !== "string" || !o.templateId.trim()) return null;
    return {
      templateId: o.templateId.trim(),
      // The name is remembered so a template that is later rebuilt in Front (which
      // gives it a NEW id) can still be found by name — see fetchTemplate.
      templateName: typeof o.templateName === "string" && o.templateName.trim() ? o.templateName.trim() : o.templateId.trim(),
    };
  } catch {
    return null;
  }
}

export async function setSupervisorContactTemplate(template: SupervisorContactTemplate): Promise<void> {
  const templateId = template.templateId.trim();
  if (!templateId) throw new Error("Choose a Front template.");
  const valueJson = JSON.stringify({
    templateId,
    templateName: template.templateName.trim() || templateId,
  });
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: TEMPLATE_KEY } },
    create: { scope: SCOPE, key: TEMPLATE_KEY, valueJson },
    update: { valueJson },
  });
}

// ---------------------------------------------------------------------------
// Who it goes to, and what it discloses.

export type HireForSupervisorEmail = {
  id: string;
  name: string;
  position: string | null;
  businessCardTitle: string | null;
  phone: string | null;
  ssEmail: string | null;
  supervisorName: string | null;
  supervisorEmail: string | null;
  supervisorHire?: { name: string; ssEmail: string | null; personalEmail: string | null } | null;
  supervisor2Name: string | null;
  supervisor2Email: string | null;
  supervisor2Hire?: { name: string; ssEmail: string | null; personalEmail: string | null } | null;
};

/** Exactly what is being disclosed about the hire — shown in the dialog before
 *  anybody presses send, because one of these fields is a personal cell number. */
export type SupervisorContactCard = {
  name: string;
  title: string | null;
  phone: string | null;
  email: string | null;
};

type ResolvedSupervisor = ReturnType<typeof resolveSupervisors>[number];

export type SupervisorContactTargets = {
  /** Addresses that will actually receive it — one per supervisor slot that has
   *  an address. Never empty; a hire with none throws instead. */
  to: string[];
  cc: string[];
  supervisors: ResolvedSupervisor[];
  hireCard: SupervisorContactCard;
  /** Non-blocking problems, e.g. a supervisor with a name but no address. */
  warnings: string[];
};

/**
 * Everything that can be decided WITHOUT talking to Front.
 *
 * Split out from the build on purpose: it lets the send dialog show who the email
 * would go to and what it would disclose even before a template has been chosen,
 * which is the state this feature ships in.
 */
export function resolveSupervisorContactTargets(hire: HireForSupervisorEmail): SupervisorContactTargets {
  const supervisors = resolveSupervisors(hire);
  const to = supervisors.map((s) => s.email).filter((e): e is string => Boolean(e));

  // Wording lifted from buildOrientationEmail's supervisor branch, because it is
  // the same fact about the same two fields and two different sentences for it
  // would be two things to keep true. A throw, so nothing goes out.
  if (to.length === 0) {
    throw new Error(
      `${hire.name} has no supervisor on file — link one (or type an address) on their profile before sending their contact details.`
    );
  }

  const warnings: string[] = [];
  // A slot filled with a name but no address can't receive the email — say so
  // rather than quietly sending to only one of the two.
  const missing = supervisors.filter((s) => !s.email).map((s) => s.name);
  if (missing.length) warnings.push(`No email on file for ${missing.join(" and ")}, so they won't get this.`);

  const phone = hire.phone?.trim() || null;
  // The SkyShare address only. The personal one is deliberately NOT a fallback:
  // this email exists so a supervisor can reach their new report at work, and the
  // hire never agreed to have their personal address handed round the business.
  const email = hire.ssEmail?.trim() || null;
  if (!phone && !email) {
    throw new Error(
      `${hire.name} has no phone number and no SkyShare email on file, so there is nothing to send. Add one to their profile first.`
    );
  }

  // businessCardTitle is the override she already maintains for the printed card —
  // when it is set it is the title this person is introduced by, so it wins here too.
  const title = hire.businessCardTitle?.trim() || hire.position?.trim() || null;

  return {
    to,
    cc: CC,
    supervisors,
    hireCard: { name: hire.name, title, phone, email },
    warnings,
  };
}

/** The hire's card, in the template's own Verdana/9pt, appended under the body. */
function hireCardHtml(card: SupervisorContactCard): string {
  const rows = [
    `<b>${esc(card.name)}</b>`,
    card.title ? esc(card.title) : null,
    card.phone ? `Mobile: ${esc(card.phone)}` : null,
    card.email ? `Email: <a href="mailto:${esc(card.email)}">${esc(card.email)}</a>` : null,
  ].filter((r): r is string => r !== null);

  return (
    `<div><br /></div>` +
    `<div style="line-height: 1.5;" dir="ltr">` +
    `<span style="font-family: Verdana, sans-serif;">` +
    `<span style="background-color: transparent; font-size: 9pt;">` +
    rows.join("<br />") +
    `</span></span></div>`
  );
}

export type SupervisorContactEmailPreview = {
  to: string[];
  cc: string[];
  /** Who the greeting is addressed to, first names, joined for two supervisors. */
  firstName: string;
  subject: string;
  /** The per-recipient half — rebuilt from the names, never overridden. */
  greetingHtml: string;
  /** The template half with the hire's card appended. This is what the send
   *  dialog lets her edit. */
  bodyHtml: string;
  /** greetingHtml + bodyHtml — what actually goes out. */
  html: string;
  templateId: string;
  templateName: string;
  /** True when the body is a hand edit rather than the live template. */
  edited: boolean;
  /** Repeated here so the confirm dialog and the send read the same object. */
  hireCard: SupervisorContactCard;
  supervisors: ResolvedSupervisor[];
  warnings: string[];
};

/**
 * Build the exact email that would be sent. Used for BOTH the preview and the
 * send, so what she approves is what actually goes out.
 *
 * `templateId` overrides the saved setting for this build only — that is what
 * makes the in-dialog picker live: choosing a template re-previews with it
 * immediately, and the same id is passed back on send so the message she read is
 * the message that leaves.
 *
 * `bodyOverride` replaces the template body for THIS SEND ONLY and never the
 * greeting. Nothing is written back to Front and the next send reads the live
 * template again. Worth knowing for this one specifically: the hire's contact
 * card is part of the body, so an edited body is whatever she typed, card
 * included — the append does not run again over it. The dialog says so next to
 * the box.
 */
export async function buildSupervisorContactEmail(
  hire: HireForSupervisorEmail,
  bodyOverride?: string | null,
  templateOverride?: SupervisorContactTemplate | null
): Promise<SupervisorContactEmailPreview> {
  const targets = resolveSupervisorContactTargets(hire);

  const template = templateOverride ?? (await getSupervisorContactTemplate());
  if (!template) {
    throw new Error(
      "No Front template has been chosen for this email yet. Pick one in this window — it is remembered for every hire after this."
    );
  }

  const tpl = await fetchTemplate(template.templateId, template.templateName);

  const first =
    targets.supervisors
      .map((s) => {
        const { firstName } = splitCandidateName(s.name);
        return firstName || s.name?.split(/\s+/)[0] || null;
      })
      .filter((n): n is string => Boolean(n))
      .join(" and ") || "there";

  const edited = Boolean(bodyOverride && bodyOverride.trim());
  const bodyHtml = edited ? cleanEditedBody(bodyOverride as string) : tpl.body + hireCardHtml(targets.hireCard);
  const greeting = greetingHtml(first);

  return {
    to: targets.to,
    cc: targets.cc,
    firstName: first,
    subject: tpl.subject,
    greetingHtml: greeting,
    bodyHtml,
    html: greeting + bodyHtml,
    templateId: tpl.id,
    templateName: tpl.name,
    edited,
    hireCard: targets.hireCard,
    supervisors: targets.supervisors,
    warnings: targets.warnings,
  };
}

// ---------------------------------------------------------------------------
// Send record. Its own key beside the other three, in a WorkspaceSetting rather
// than a new column so this ships without a migration against the shared live
// database — the same trade every send path here makes.

export type SupervisorContactSendRecord = {
  // Optional to match the other records: Front answers 202 and returns the ids it
  // created, but the shape is not guaranteed, so neither id is treated as certain.
  conversationId?: string;
  messageId?: string;
  sentAt: string;
  /** Comma-joined when a hire has two supervisors, matching how TaskSendRecord
      stores a multi-recipient send. */
  to: string;
  sentBy?: string | null;
  /** Which send-guard mode was in force, so a redirected test send is not later
      mistaken for a real delivery to the address recorded above. */
  mode?: string;
  /** Whether the body was hand-edited for that send. */
  edited?: boolean;
  templateName?: string;
};

type SendMap = Record<string, SupervisorContactSendRecord>;

async function readAll(): Promise<SendMap> {
  const row = await prisma.workspaceSetting.findUnique({
    where: { scope_key: { scope: SCOPE, key: SENDS_KEY } },
    select: { valueJson: true },
  });
  if (!row?.valueJson) return {};
  try {
    const parsed = JSON.parse(row.valueJson) as unknown;
    return (parsed && typeof parsed === "object" ? parsed : {}) as SendMap;
  } catch {
    return {};
  }
}

export async function getSupervisorContactSendRecord(hireId: string): Promise<SupervisorContactSendRecord | null> {
  return (await readAll())[hireId] ?? null;
}

export async function recordSupervisorContactSend(hireId: string, rec: SupervisorContactSendRecord): Promise<void> {
  // Read-modify-write of one JSON blob. Sends are one-at-a-time from a confirm
  // dialog, so the concurrent-write problem the feedback batch hit does not apply.
  const all = await readAll();
  all[hireId] = rec;
  const valueJson = JSON.stringify(all);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: SENDS_KEY } },
    create: { scope: SCOPE, key: SENDS_KEY, valueJson },
    update: { valueJson },
  });
}
