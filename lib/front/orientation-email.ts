import { prisma } from "@/lib/prisma";
import { splitCandidateName } from "@/lib/candidates/normalize";
import { formatTimeRange } from "@/lib/calendar/format";
import { ordinalDayLabel } from "@/lib/dates/ordinal";
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

/**
 * The one regex that finds an hours range in template prose ("9:30am to 3:00pm").
 *
 * Shared on purpose. The drift WARNING and the override below must agree about
 * what counts as a time range, or the email could be rewritten without a warning
 * or warned about without being rewritten.
 */
const TIME_RANGE_RE = /\d{1,2}:\d{2}\s*[ap]m\s*(?:to|-|–)\s*\d{1,2}:\d{2}\s*[ap]m/gi;

/** Compare two written time ranges ignoring case, spacing, dash style and to/-. */
function normalizeTimeRange(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "").replace(/–/g, "-").replace(/to/g, "-");
}

/**
 * Rewrite the hours and the address in a template body to match THIS session.
 *
 * WHY THIS EXISTS. Hannah, 2026-08-31: "most of our orientations are at the same
 * time, but every once in a while the time is different, so we need to be able to
 * change the body of the emails that go out and the time or location when needed."
 * Until now the only remedy was editing the Front template, which would change
 * every future session too. The app already DETECTED the mismatch and printed a
 * warning; it just refused to act on it.
 *
 * Both rewrites are anchored, not guessed:
 *   TIME — the shared regex above matches a written range, and only ranges that
 *     disagree with the session are replaced. A template that already agrees is
 *     untouched.
 *   ADDRESS — anchored on the "Location:" LABEL the templates use, capturing only
 *     to the end of that text node so it cannot run past a tag. The subject
 *     deliberately does the opposite (see fillSubject): there "Location" is a
 *     token to replace, here it is a label followed by the real address.
 *
 * Every change is reported so the preview can say what it did. Silent rewriting of
 * somebody's copy would be worse than the problem.
 */
export function applySessionOverrides(
  html: string,
  session: { date: string; endsAt: string | null; address?: string | null }
): { text: string; changes: string[]; warnings: string[] } {
  let text = html;
  const changes: string[] = [];
  const warnings: string[] = [];

  if (session.endsAt) {
    const actual = formatTimeRange(session.date, session.endsAt).replace(/\s*MT$/, "");
    const want = normalizeTimeRange(actual);
    text = text.replace(TIME_RANGE_RE, (match) => {
      if (normalizeTimeRange(match) === want) return match;
      changes.push(`the time now reads ${actual} (the template said ${match.trim()})`);
      return actual;
    });
  } else {
    // NO END TIME ON THE SESSION — and this used to degrade in silence.
    //
    // The old drift warning fired by comparing the template's hours to the
    // session's; when the override replaced it, the whole comparison moved
    // inside the `if (session.endsAt)` above. So a session with a null endsAt
    // got no rewrite AND no warning, which is indistinguishable on screen from
    // "the template and the session agree". The template's hours went out
    // unchecked and nothing said so.
    //
    // There is genuinely nothing to check against here, so this does not guess —
    // it names the range that is about to be sent and says nobody verified it.
    const found = [...html.matchAll(TIME_RANGE_RE)].map((m) => m[0].trim());
    const unique = [...new Set(found)];
    if (unique.length) {
      warnings.push(
        `This session has no end time recorded, so the hours in this email (${unique.join(", ")}) came straight from the Front template and were NOT checked against the session. Set an end time on the session if that is wrong.`
      );
    }
  }

  const address = session.address?.trim();
  if (address) {
    text = text.replace(/(Location:\s*(?:<[^>]+>\s*)*)([^<\n]+)/gi, (full, label: string, current: string) => {
      const shown = current.trim();
      if (!shown || shown === address) return full;
      changes.push(`the location now reads ${address} (the template said ${shown})`);
      return label + address;
    });
  }

  return { text, changes, warnings };
}

// --- editing the body for one send ------------------------------------------

/**
 * A body typed by the person approving THIS send.
 *
 * WHY THIS EXISTS. Hannah, 2026-08-31: an email built from a template should
 * still give her a box to change what it says, because occasionally one session
 * needs wording no future session should inherit. Until now the only remedy was
 * editing the Front template, which changes every send after it too.
 *
 * SCOPE, and it is deliberately narrow:
 *   - it applies to ONE send. Nothing is written back to Front, no template is
 *     created, and the next send re-reads the live template as before.
 *   - it replaces the template BODY only, never the greeting. The greeting is
 *     per-recipient ("Hi Axel,", "Hi Rich, Your new hires ... are attending"),
 *     so an edit made once can still go to a whole cohort without carrying one
 *     person's name to everybody.
 *   - the AUTOMATIC REMINDER CRON NEVER PASSES ONE. See the note on the
 *     bodyOverride parameter below.
 *
 * Deliberately NOT run through lib/richtext/normalize.ts or the candidate-note
 * sanitizer. Both snap markup down to the small vocabulary those features store
 * (p / strong / em / a / a fixed colour and size palette), which would rewrite
 * the Front template's own Verdana 9pt markup on EVERY send — including the
 * common case where nobody changed a word. What is stripped here is only what
 * can execute, which no email client honours anyway, so nothing legible is lost.
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

/** The banner the preview and the send record both hang off. One string, so the
    dialog cannot describe an edited send differently from the history does. */
export const EDITED_BODY_WARNING =
  "EDITED FOR THIS SEND — the body below was changed by hand and is no longer the Front template. The change applies to this send only; the template in Front is untouched and every later send reads it fresh.";

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
  /** The two halves of `html`, split so the send dialog can make the body
      EDITABLE while the per-recipient greeting stays fixed. Concatenating them
      is exactly `html`; callers that only want the whole thing can ignore both. */
  greetingHtml: string;
  bodyHtml: string;
  /** True when bodyHtml came from the sender rather than the Front template. */
  bodyEdited: boolean;
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
  /** Street address. OPTIONAL on purpose: a caller that does not select it simply
      gets no location override, rather than every call site breaking. */
  address?: string | null;
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
  testTo?: string | null,
  /**
   * Replace the template body for THIS SEND ONLY — see cleanEditedBody above.
   *
   * MANUAL SENDS ONLY, and this is load-bearing. The automatic reminder
   * (lib/orientation/reminder.ts) fires from a cron with nobody watching, so
   * there is no human to have approved any wording; it calls this WITHOUT a
   * bodyOverride and must keep doing so, sending the live Front template plus
   * the session overrides above. If you are adding an edit box to something,
   * check first whether a person is present at send time — if not, it does not
   * get one.
   */
  bodyOverride?: string | null
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

  // NOBODY is cc'd on an attendee email. It goes to the new hire, and only them.
  //
  // Two rounds of the same lesson, both from the first real send. One personalised
  // email per hire means ANY fixed cc list produces one copy per hire:
  //  - The standing internal list got six copies each (~40 redundant emails for a
  //    six-person cohort). They now get one session summary instead.
  //  - Then the supervisors: cc'ing each hire's own supervisor looks per-person, but
  //    a supervisor of four hires still collects four copies. Jonathan Schaedig got
  //    4, Rich Paden 3. Removed, because template 2 already emails each supervisor
  //    ONCE, naming every hire they cover — so the information was never lost, only
  //    the duplication.
  //
  // The rule worth keeping: on a per-hire send, a recipient who is not the hire
  // will be multiplied by the cohort size. Put them on a digest, not a cc.
  const cc: string[] = [];

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

  // The template hardcodes the hours and the address in prose. We now REWRITE them
  // to match this session rather than only warning, because the only previous remedy
  // was editing the Front template, which would have changed every future session.
  // Nothing is silent: every substitution is reported back as a warning line so the
  // preview shows exactly what was changed before anybody sends it.
  const overrides = applySessionOverrides(bodyFill.text, session);
  bodyFill.text = overrides.text;
  for (const change of overrides.changes) {
    warnings.push(`Adjusted for this session: ${change}.`);
  }
  // Separate from the changes: things the override could NOT check, which have
  // to be said out loud rather than left looking like agreement.
  warnings.push(...overrides.warnings);
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

  // The per-send edit. It replaces the body BELOW the greeting, so the same
  // edited wording can be sent to a cohort and each person still gets their own
  // "Hi <first>,". The warning goes to the FRONT of the list: everything else
  // there describes what the template resolution did to the text that pre-filled
  // the box, and that stops being the whole story the moment it is edited.
  const edited = Boolean(bodyOverride && bodyOverride.trim());
  const body = edited ? cleanEditedBody(bodyOverride!) : bodyFill.text;
  if (edited) warnings.unshift(EDITED_BODY_WARNING);

  return {
    templateKey: key,
    templateName: tpl.name,
    to: finalTo,
    toName,
    toSource,
    cc: finalCc,
    subject: subjectFill.text,
    greetingHtml: greeting,
    bodyHtml: body,
    bodyEdited: edited,
    html: greeting + body,
    warnings
  };
}

// --- one email per SUPERVISOR ------------------------------------------------
//
// The per-attendee supervisors email is keyed off the new hire, so a supervisor
// with four new hires got four near-identical emails (on the real Aug 4 session
// that was Jonathan Schaedig x4 and Rich Paden x3). This builds ONE email per
// supervisor instead, naming everyone they cover.
//
// The template body still comes from Front untouched. What is added is a greeting
// and a single line saying who this is about — the Front template cannot know the
// names, and a supervisor reading "your new hire" with no name has to go and ask.

/** "Axel", "Axel and Gavin", "Axel, Gavin and Bryan" — how a person writes a list. */
export function nameList(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function digestIntroHtml(supervisorFirst: string, hireNames: string[]): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
  const who = esc(nameList(hireNames));
  const plural = hireNames.length === 1 ? "is" : "are";
  const noun = hireNames.length === 1 ? "new hire" : "new hires";
  return (
    `<div style="line-height: 1.5;" dir="ltr"><span style="font-family: Verdana, sans-serif;">` +
    `<span style="background-color: transparent; font-size: 9pt;">Hi ${esc(supervisorFirst)},</span>` +
    `</span></div><div><br /></div>` +
    `<div style="line-height: 1.5;" dir="ltr"><span style="font-family: Verdana, sans-serif;">` +
    `<span style="background-color: transparent; font-size: 9pt;">` +
    `Your ${noun} ${who} ${plural} attending New Hire Orientation.` +
    `</span></span></div><div><br /></div>`
  );
}

export type SupervisorDigest = {
  supervisorName: string | null;
  supervisorEmail: string;
  /** Every attendee on this session that this supervisor covers. */
  hireNames: string[];
  attendeeIds: string[];
};

/**
 * One supervisors email, addressed to a single supervisor, covering all of their
 * new hires on this session.
 */
export async function buildSupervisorDigestEmail(
  digest: SupervisorDigest,
  session: SessionForEmail,
  testTo?: string | null,
  /** Manual sends only — same rule as buildOrientationEmail's bodyOverride. */
  bodyOverride?: string | null
): Promise<OrientationEmailPreview> {
  const tpl = await fetchTemplate("supervisors");
  const warnings: string[] = [];
  const isTest = Boolean(testTo?.trim());

  // No standing cc here either — six supervisor emails would have meant six copies
  // for every watcher. The session summary covers them once.
  const cc: string[] = [];

  let toList = [digest.supervisorEmail];
  let toSource: OrientationEmailPreview["toSource"] = "supervisor";
  if (isTest) {
    warnings.unshift(
      `TEST SEND — going only to ${testTo!.trim()}. Nobody is cc'd. The real recipient would have been ${digest.supervisorEmail}.`
    );
    toList = [testTo!.trim()];
    toSource = "test";
  }

  const subjectFill = fillSubject(tpl.subject ?? "", session.date, session.location);
  const cleaned = stripInstructionBlock(tpl.body ?? "");
  if (!cleaned.stripped) {
    warnings.push(
      "Couldn't find the red 'delete this part' block in the template, so nothing was removed — check the preview before sending."
    );
  }
  const bodyFill = fillDatePlaceholders(cleaned.body, session.date);
  // Same session overrides as the attendee builder. Both feed all three templates
  // and the reminder cron, so applying it in one place only would leave the digest
  // quoting a time the attendee email had already corrected.
  //
  // The CHANGES it reports are surfaced here exactly as the attendee builder
  // surfaces them. They used to be computed and thrown away, so the supervisors
  // email was the one that got silently rewritten: the attendee preview said
  // "Adjusted for this session: the time now reads 9:30am to 1:00pm" and the
  // supervisors preview, sent from the same session and rewritten the same way,
  // said nothing at all.
  const digestOverrides = applySessionOverrides(bodyFill.text, session);
  bodyFill.text = digestOverrides.text;
  for (const change of digestOverrides.changes) {
    warnings.push(`Adjusted for this session: ${change}.`);
  }
  warnings.push(...digestOverrides.warnings);
  if (subjectFill.count + bodyFill.count === 0) {
    warnings.push("No [Day, Date] placeholder found to replace — the date in this email may be stale.");
  }

  const first = digest.supervisorName
    ? splitCandidateName(digest.supervisorName).firstName || digest.supervisorName.split(/\s+/)[0]
    : "there";

  const seen = new Set<string>();
  const finalTo = toList.map((t) => t.trim()).filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
  const finalCc = cc.map((c) => c.trim()).filter((c) => c && !seen.has(c.toLowerCase()) && seen.add(c.toLowerCase()));

  // The intro names THIS supervisor and THEIR hires, so it stays out of the
  // editable half for the same reason the attendee greeting does.
  const greeting = digestIntroHtml(first, digest.hireNames);
  const edited = Boolean(bodyOverride && bodyOverride.trim());
  const body = edited ? cleanEditedBody(bodyOverride!) : bodyFill.text;
  if (edited) warnings.unshift(EDITED_BODY_WARNING);

  return {
    templateKey: "supervisors",
    templateName: tpl.name,
    to: finalTo,
    toName: digest.supervisorName ?? digest.supervisorEmail,
    toSource,
    cc: finalCc,
    subject: subjectFill.text,
    greetingHtml: greeting,
    bodyHtml: body,
    bodyEdited: edited,
    html: greeting + body,
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
  /** Everyone copied. Computed at send time from the standing list plus the hire's
      supervisors, and previously thrown away — so "was Kevin copied on Axel's
      invitation?" was unanswerable after the fact. Records written before Jul 27
      have no cc, which is why the history says "not recorded" rather than "nobody". */
  cc?: string;
  /** The subject as actually sent, so history reads without opening Front. */
  subject?: string;
  sentBy?: string | null;
  /** True when the body was hand-edited for that send rather than being the
      Front template. Optional because records written before this existed
      cannot say either way — the history shows those as unknown, not as
      "template", which would be a claim nobody made. */
  edited?: boolean;
};

/** Deep link to a Front conversation. Lives in lib/front/links.ts, which is
    client-safe, so the history table can use the same helper instead of inlining
    the URL — re-exported here for callers already importing from this module. */
export { frontConversationUrl } from "./links";

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
