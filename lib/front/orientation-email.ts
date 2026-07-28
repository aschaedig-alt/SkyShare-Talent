import { prisma } from "@/lib/prisma";
import { splitCandidateName } from "@/lib/candidates/normalize";
import { formatTimeRange } from "@/lib/calendar/format";
import { ordinalDayLabel } from "@/lib/dates/ordinal";
import { getOrientationCc } from "@/lib/orientation/email-cc";
import {
  ORIENTATION_TEMPLATE_META,
  orientationTemplateMeta,
  type OrientationTemplateKey
} from "@/lib/orientation/email-templates-meta";
import { frontFetch } from "./client";

// Orientation email, sent from the app using the team's OWN Front templates.
//
// Same principle as onboarding-email.ts: the BODY LIVES IN FRONT. HR maintains the
// templates there and edits them there, so we fetch the current body at send time
// instead of keeping a copy that silently drifts. What the app adds is everything
// the template currently asks a human to do by hand.
//
// The template body literally documents that manual work, in red, at the top:
//
//   <delete this part>
//   to: (each new employee's company email)
//   cc: (each new employees supervisor), HR hrotasks@, Morgan, Ricky, Hannah,
//       Kevin, Aimee
//   Update Day, Date 3 times
//   <delete this part>
//
// So: strip that block, fill the recipients, and substitute the date placeholders
// (1 in the subject + 2 in the body = the "3 times" the note means).

// The template list lives in a client-safe module so the UI and the send path
// read the SAME definitions — this file can't be imported by a browser component
// because it pulls in Prisma and the Front client.
export const ORIENTATION_TEMPLATES = ORIENTATION_TEMPLATE_META;
export const orientationTemplate = orientationTemplateMeta;
export type { OrientationTemplateKey };

type FrontTemplate = { id: string; name: string; subject: string; body: string };

/** Fetch by id, falling back to a name lookup if the template was rebuilt in Front
    (a rebuild changes the id). Keeps the send working without a code change. */
async function fetchTemplate(key: OrientationTemplateKey): Promise<FrontTemplate> {
  const def = orientationTemplate(key);
  try {
    return await frontFetch<FrontTemplate>(`/message_templates/${def.id}`);
  } catch {
    const page = await frontFetch<{ _results: FrontTemplate[] }>("/message_templates");
    const match = page._results.find((t) => t.name?.trim() === def.frontName);
    if (!match) {
      throw new Error(
        `Front template "${def.frontName}" not found. It may have been renamed — check Front, then update ORIENTATION_TEMPLATES.`
      );
    }
    return match;
  }
}

// --- template cleanup -------------------------------------------------------

/**
 * Remove the red "<delete this part>" instruction block the template opens with.
 *
 * The markers are HTML-escaped in the stored body (&lt;delete this part&gt;) and
 * appear twice, wrapping the note. We cut from the start of the element containing
 * the first marker through the end of the one containing the second. If the markers
 * aren't found the body is returned untouched — better to send the note visible
 * (obvious, someone fixes it) than to guess at a cut and silently eat real content.
 */
export function stripInstructionBlock(html: string): { body: string; stripped: boolean } {
  const marker = /&lt;\s*delete this part\s*&gt;/gi;
  const hits = [...html.matchAll(marker)];
  if (hits.length < 2) return { body: html, stripped: false };

  const first = hits[0].index ?? 0;
  const last = (hits[1].index ?? 0) + hits[1][0].length;

  // Widen to whole elements so we don't leave a dangling <div>.
  const openStart = html.lastIndexOf("<", first);
  const start = openStart >= 0 ? html.lastIndexOf("<div", first) : first;
  const closeEnd = html.indexOf("</div>", last);
  const end = closeEnd >= 0 ? closeEnd + "</div>".length : last;

  const cutFrom = start >= 0 ? start : first;
  if (end <= cutFrom) return { body: html, stripped: false };
  return { body: (html.slice(0, cutFrom) + html.slice(end)).trim(), stripped: true };
}

/** "Tuesday, August 4th" — how a person writes an event date. Deliberately no year:
    the templates read "we look forward to seeing you on [Day, Date]!", and a year
    there is noise. Always the Mountain day, so a late-evening instant can't slip.
    The ORDINAL is shared with the calendar invite title so the same session cannot
    read "August 4th" on the invite and "August 4" in the email. */
function sessionDayLabel(sessionDate: string): string {
  return ordinalDayLabel(sessionDate);
}

/**
 * Fill a SUBJECT line. Subjects are short plain text, so the "Location" token in
 * the supervisors subject ("… - Day, Date - Location") can be replaced safely.
 * Bodies deliberately do NOT get this: there, "Location" is a LABEL followed by
 * the real address ("Location: 180 2400 W, Salt Lake City"), and replacing it
 * would overwrite the address with itself. Verified against all three templates.
 */
export function fillSubject(subject: string, sessionDate: string, location: string | null): { text: string; count: number } {
  const dated = fillDatePlaceholders(subject, sessionDate);
  let text = dated.text;
  let count = dated.count;
  if (location?.trim()) {
    text = text.replace(/\bLocation\b/g, () => {
      count++;
      return location.trim();
    });
  }
  return { text, count };
}

/** Replace the template's [Day, Date] placeholders with the real session day.
    Tolerates the unbracketed "Day, Date" the supervisors template uses. */
export function fillDatePlaceholders(text: string, sessionDate: string): { text: string; count: number } {
  const day = sessionDayLabel(sessionDate);
  let count = 0;
  const out = text
    .replace(/\[\s*Day,\s*Date\s*\]/gi, () => {
      count++;
      return day;
    })
    .replace(/(?<![[\w])Day,\s*Date(?!\s*\])/g, () => {
      count++;
      return day;
    });
  return { text: out, count };
}

// --- recipients -------------------------------------------------------------

// The standing cc list is an editable SETTING (lib/orientation/email-cc.ts), not a
// constant here — it began as red text inside the Front template, and people change
// roles far more often than the email body does.

export type OrientationEmailPreview = {
  templateKey: OrientationTemplateKey;
  templateName: string;
  /** One or more recipients — the supervisors email goes to both supervisors. */
  to: string[];
  toName: string;
  /** Which field the address came from, so the confirm dialog can say so. */
  toSource: "company" | "personal" | "supervisor" | "test";
  cc: string[];
  subject: string;
  html: string;
  /** Things the sender should see before approving. */
  warnings: string[];
};

type SupervisorFields = {
  supervisorName: string | null;
  supervisorEmail: string | null;
  supervisorHire?: { name: string; ssEmail: string | null; personalEmail: string | null } | null;
  supervisor2Name: string | null;
  supervisor2Email: string | null;
  supervisor2Hire?: { name: string; ssEmail: string | null; personalEmail: string | null } | null;
};

type AttendeeForEmail = {
  name: string;
  ssEmail: string | null;
  personalEmail: string | null;
} & SupervisorFields;

type ResolvedSupervisor = { name: string | null; email: string | null; linked: boolean };

/** One supervisor from a link-or-type pair: the LINKED record wins over the typed
    fallback, so a changed address follows automatically. */
function resolveOne(
  link: { name: string; ssEmail: string | null; personalEmail: string | null } | null | undefined,
  typedName: string | null,
  typedEmail: string | null
): ResolvedSupervisor | null {
  const linkedEmail = link?.ssEmail?.trim() || link?.personalEmail?.trim() || null;
  if (link && linkedEmail) return { name: link.name, email: linkedEmail, linked: true };
  const email = typedEmail?.trim() || null;
  const name = typedName?.trim() || link?.name || null;
  if (!name && !email) return null; // this slot is empty
  return { name, email, linked: false };
}

/** Both supervisors, primary first, skipping empty slots. A hire may have zero,
    one, or two. Callers decide what to do when a slot has a name but no address. */
export function resolveSupervisors(a: SupervisorFields): ResolvedSupervisor[] {
  return [
    resolveOne(a.supervisorHire, a.supervisorName, a.supervisorEmail),
    resolveOne(a.supervisor2Hire, a.supervisor2Name, a.supervisor2Email)
  ].filter((s): s is ResolvedSupervisor => s !== null);
}

type SessionForEmail = {
  date: string;
  endsAt: string | null;
  location: string | null;
};

function greetingHtml(name: string): string {
  const safe = name.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
  return (
    `<div style="line-height: 1.5;" dir="ltr">` +
    `<span style="font-family: Verdana, sans-serif;">` +
    `<span style="background-color: transparent; font-size: 9pt;">Hi ${safe},</span>` +
    `</span></div><div><br /></div>`
  );
}

/**
 * Build the exact email that would be sent — used for BOTH the preview and the
 * send, so what is approved is what goes out.
 */
export async function buildOrientationEmail(
  key: OrientationTemplateKey,
  attendee: AttendeeForEmail,
  session: SessionForEmail,
  /**
   * Redirect the whole email to ONE address and drop every cc. This is what makes
   * a test send safe: without it, "just testing" would really email the new hire,
   * their supervisor, and everyone on the standing cc list.
   */
  testTo?: string | null
): Promise<OrientationEmailPreview> {
  const def = orientationTemplate(key);
  const tpl = await fetchTemplate(key);
  const warnings: string[] = [];
  const isTest = Boolean(testTo?.trim());

  // Recipient. The invitation says "company email" on purpose: by orientation the
  // SkyShare address exists (unlike the onboarding-journey email, which goes to a
  // personal address because the company one isn't created yet).
  // to can be more than one address — the supervisors email goes to BOTH
  // supervisors when a hire has two.
  let toList: string[] = [];
  let toName = attendee.name;
  let toSource: OrientationEmailPreview["toSource"];
  const supervisors = resolveSupervisors(attendee);
  const supervisorEmails = supervisors.map((s) => s.email).filter((e): e is string => Boolean(e));

  if (def.audience === "supervisor") {
    toList = supervisorEmails;
    toName = supervisors.map((s) => s.name).filter(Boolean).join(" and ") || "there";
    toSource = "supervisor";
    if (toList.length === 0) {
      throw new Error(
        `${attendee.name} has no supervisor on file — link one (or type an address) on their profile before sending the supervisors email.`
      );
    }
    // A slot filled with a name but no address can't receive the email — say so
    // rather than quietly sending to only one of the two.
    const missing = supervisors.filter((s) => !s.email).map((s) => s.name);
    if (missing.length) warnings.push(`No email on file for ${missing.join(" and ")}, so they won't get this.`);
  } else {
    const one = attendee.ssEmail?.trim() || attendee.personalEmail?.trim();
    toSource = attendee.ssEmail?.trim() ? "company" : "personal";
    if (!one) {
      throw new Error(`${attendee.name} has no email address on file — add one before sending.`);
    }
    toList = [one];
    if (toSource === "personal") {
      warnings.push(
        "No SkyShare email on file, so this is going to their personal address. The template tells them a calendar invite went to their company email."
      );
    }
  }

  // cc: the editable standing list, plus BOTH of this hire's supervisors.
  const cc: string[] = [];
  if (!isTest) {
    cc.push(...(await getOrientationCc()).addresses);
    if (def.audience === "attendee") {
      if (supervisorEmails.length) cc.push(...supervisorEmails);
      else warnings.push(`No supervisor on file for ${attendee.name}, so no supervisor is cc'd.`);
    }
  }

  // A test overrides the recipient AFTER the real one has been resolved, so the
  // preview still proves the real address(es) would have been found.
  if (isTest) {
    const realTo = toList.join(", ");
    toList = [testTo!.trim()];
    toSource = "test";
    warnings.unshift(
      `TEST SEND — going only to ${toList[0]}. Nobody is cc'd. The real recipient would have been ${realTo}.`
    );
  }

  // Date placeholders: 1 in the subject + 2 in the body — the template's own red
  // note says "Update Day, Date 3 times".
  const subjectFill = fillSubject(tpl.subject ?? "", session.date, session.location);
  const cleaned = stripInstructionBlock(tpl.body ?? "");
  if (!cleaned.stripped) {
    warnings.push(
      "Couldn't find the red 'delete this part' block in the template, so nothing was removed — check the preview before sending."
    );
  }
  const bodyFill = fillDatePlaceholders(cleaned.body, session.date);
  const filled = subjectFill.count + bodyFill.count;
  if (filled === 0) {
    warnings.push("No [Day, Date] placeholder found to replace — the date in this email may be stale.");
  }

  // Drift check: the template hardcodes the hours in prose. We deliberately do NOT
  // rewrite that (it's HR's copy), but we do say when it disagrees with the session.
  if (session.endsAt) {
    const actual = formatTimeRange(session.date, session.endsAt).replace(/\s*MT$/, "");
    const times = [...bodyFill.text.matchAll(/\d{1,2}:\d{2}\s*[ap]m\s*(?:to|-|–)\s*\d{1,2}:\d{2}\s*[ap]m/gi)].map((m) =>
      m[0].toLowerCase().replace(/\s+/g, "")
    );
    const want = actual.toLowerCase().replace(/\s+/g, "").replace(/–/g, "-");
    const mismatch = times.filter((t) => t.replace(/–/g, "-").replace(/to/g, "-") !== want.replace(/to/g, "-"));
    if (times.length && mismatch.length) {
      warnings.push(
        `The template says ${times.join(" / ")} but this session is ${actual}. Fix the wording in Front if that's wrong.`
      );
    }
  }

  // Dedupe case-insensitively, and keep cc from repeating anyone already in to.
  const seen = new Set<string>();
  const finalTo = toList.map((t) => t.trim()).filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
  const finalCc = cc.map((c) => c.trim()).filter((c) => c && !seen.has(c.toLowerCase()) && seen.add(c.toLowerCase()));

  // The greeting: attendee emails get a personal "Hi <first>,". The supervisors
  // email does NOT — its template already opens "Hello Supervisors," and it can
  // go to two people, so a single-name greeting would be wrong.
  const { firstName } = splitCandidateName(attendee.name);
  const first = firstName || attendee.name.split(/\s+/)[0] || "there";
  const greeting = def.audience === "attendee" ? greetingHtml(first) : "";

  return {
    templateKey: key,
    templateName: tpl.name,
    to: finalTo,
    toName,
    toSource,
    cc: finalCc,
    subject: subjectFill.text,
    html: greeting + bodyFill.text,
    warnings
  };
}

// --- send record ------------------------------------------------------------
// Which orientation emails actually went out, per attendee. The existing
// sentTemplateKeys column on OrientationAttendee stays the source of truth for the
// tick boxes; this adds the Front conversation id so a send can be traced back.

const SCOPE = "front";
const KEY = "orientation-sends";

export type OrientationSendRecord = {
  conversationId?: string;
  messageId?: string;
  sentAt: string;
  to: string;
  sentBy?: string | null;
};

/** attendeeId -> templateKey -> record */
type SendMap = Record<string, Record<string, OrientationSendRecord>>;

async function readSends(): Promise<SendMap> {
  const row = await prisma.workspaceSetting.findFirst({ where: { scope: SCOPE, key: KEY }, select: { valueJson: true } });
  if (!row?.valueJson) return {};
  try {
    const parsed = JSON.parse(row.valueJson) as SendMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * The send records for these attendees, so the grid can show WHAT REALLY HAPPENED
 * rather than just a tick.
 *
 * The distinction matters: sentTemplateKeys is hand-toggleable (it has to be — an
 * email sent from Front directly still needs recording), so a tick alone cannot
 * tell you whether the app sent it or somebody marked it. A record here means the
 * app sent it and Front confirmed; a tick with no record means marked by hand.
 */
export async function getOrientationSends(
  attendeeIds: string[]
): Promise<Record<string, Record<string, OrientationSendRecord>>> {
  if (!attendeeIds.length) return {};
  const map = await readSends();
  const out: Record<string, Record<string, OrientationSendRecord>> = {};
  for (const id of attendeeIds) {
    if (map[id]) out[id] = map[id];
  }
  return out;
}

export async function recordOrientationSend(
  attendeeId: string,
  key: OrientationTemplateKey,
  record: OrientationSendRecord
): Promise<void> {
  const map = await readSends();
  map[attendeeId] = { ...(map[attendeeId] ?? {}), [key]: record };
  const value = JSON.stringify(map);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: value },
    update: { valueJson: value }
  });
}
