import { prisma } from "@/lib/prisma";
import { getOrientationCc } from "@/lib/orientation/email-cc";
import { formatTimeRange } from "@/lib/calendar/format";
import { ordinalDayLabel } from "@/lib/dates/ordinal";
import { describeOffNormal, placeLine, resolveSessionPlace } from "@/lib/orientation/places";
import { nameList } from "./orientation-email";
import { cleanEditedBody } from "./sanitize-body";

// The ONE internal email about a session, replacing the standing list being cc'd
// on every single per-hire email.
//
// Why this body is written here rather than fetched from Front, when every other
// orientation email deliberately lives in Front: there is no Front template for it,
// because the team never sent this email — they got the same invitation N times
// instead. It is also not a copy of the invitation. The invitation tells a new hire
// where to go; this tells the internal watchers WHO IS COMING, which is the thing
// six copies of the invitation never actually said in one place.
//
// If HR later wants to own this wording, the right move is to create a Front
// template for it and switch this to fetchTemplate, exactly like the other three.

export type SummaryAttendee = {
  name: string;
  position: string | null;
  supervisorNames: string[];
  /** Whether the invitation has actually gone out to them yet. */
  invited: boolean;
};

export type OrientationSummaryPreview = {
  to: string[];
  subject: string;
  /** What is sent: the built body, or the edited one when there is an edit. */
  html: string;
  /** The body as the app built it from the session — what pre-fills the edit
      box. Equal to `html` whenever nothing was edited. */
  bodyHtml: string;
  bodyEdited: boolean;
  warnings: string[];
  /** Different than normal, in the shared wording (lib/orientation/places.ts). */
  offNormal: string[];
};

/**
 * The banner for an edited summary. NOT the shared EDITED_BODY_WARNING: that
 * one says "the template in Front is untouched", and this email has no Front
 * template — the app writes it (see the note at the top of this file). A
 * warning that names a template which does not exist sends somebody looking for
 * it.
 */
export const EDITED_SUMMARY_WARNING =
  "EDITED FOR THIS SEND — the summary below was changed by hand. The change applies to this send only; nothing is saved, and the next summary is built fresh from the session.";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

/** House style: Verdana 9pt, matching the Front templates so the summary doesn't
    look like it came from somewhere else. */
function line(inner: string): string {
  return (
    `<div style="line-height: 1.5;" dir="ltr"><span style="font-family: Verdana, sans-serif;">` +
    `<span style="background-color: transparent; font-size: 9pt;">${inner}</span></span></div>`
  );
}

const BREAK = `<div><br /></div>`;

export async function buildOrientationSummaryEmail(input: {
  sessionDate: string;
  endsAt: string | null;
  /** The session's two place columns, RAW. Resolved here through the same
      resolver the invite and the attendee emails use, rather than a fallback
      of this file's own, so the summary cannot name a different building. */
  location: string | null;
  address: string | null;
  attendees: SummaryAttendee[];
  /** Override the recipients — used by a test send. */
  testTo?: string | null;
  /**
   * The body as edited in the send dialog, for THIS SEND ONLY.
   *
   * The standing rule is that every email the app builds for a person to send
   * gets an edit box first. This one was the exception: it is written here
   * rather than fetched from Front, so it was left out of the Aug 31 work rather
   * than bolted on badly (the roadmap recorded the gap). It replaces the WHOLE
   * body, because unlike the per-hire emails there is no per-recipient greeting
   * to protect — one email goes to the whole internal list. Nothing is stored.
   * Manual sends only: nothing unattended sends this email.
   */
  bodyOverride?: string | null;
}): Promise<OrientationSummaryPreview> {
  const warnings: string[] = [];
  const isTest = Boolean(input.testTo?.trim());

  let to: string[];
  if (isTest) {
    to = [input.testTo!.trim()];
    warnings.unshift(`TEST SEND — going only to ${to[0]}.`);
  } else {
    to = (await getOrientationCc()).addresses;
    if (to.length === 0) {
      throw new Error(
        "Nobody is on the internal summary list, so there is no one to send this to. Add addresses under “Who gets the internal summary?”."
      );
    }
  }

  const day = ordinalDayLabel(input.sessionDate);
  const when = input.endsAt
    ? formatTimeRange(input.sessionDate, input.endsAt)
    : new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Denver",
        hour: "numeric",
        minute: "2-digit",
        hour12: true
      }).format(new Date(input.sessionDate));

  const count = input.attendees.length;
  const notInvited = input.attendees.filter((a) => !a.invited).map((a) => a.name);
  if (notInvited.length) {
    warnings.push(
      `${nameList(notInvited)} ${notInvited.length === 1 ? "has" : "have"} not been sent the invitation yet — the summary says so rather than implying everyone has been contacted.`
    );
  }

  const rows = input.attendees
    .map((a) => {
      const bits = [`<b>${esc(a.name)}</b>`];
      if (a.position) bits.push(esc(a.position));
      const sup = a.supervisorNames.length ? `supervisor: ${esc(nameList(a.supervisorNames))}` : `no supervisor on file`;
      bits.push(sup);
      const flag = a.invited ? "" : ` <span style="color:#b45309;">(invitation not sent yet)</span>`;
      return `<li>${bits.join(" &middot; ")}${flag}</li>`;
    })
    .join("");

  // Where, from the shared resolver. A session with no address falls back to the
  // place its name matches — HQ for every session before the place picker, which
  // is what this line always said — and one whose place is genuinely unknown
  // says its name and is flagged, rather than quietly claiming HQ.
  const place = resolveSessionPlace({ location: input.location, address: input.address });
  if (!place.address) {
    warnings.push(
      `This session's place, "${place.name}", has no street address recorded, so the summary names it without one. Set the address on the session.`
    );
  }

  // Different than normal. This summary is the app's own text rather than HR's
  // Front copy, and its readers are the people who set the room up and present,
  // so an off-normal session says so IN the email as well as to the sender.
  const offNormal = describeOffNormal({
    date: input.sessionDate,
    endsAt: input.endsAt,
    location: input.location,
    address: input.address
  });

  const built = [
    line(`New Hire Orientation is on <b>${esc(day)}</b>, ${esc(when)}, at ${esc(placeLine(place))}.`),
    ...(offNormal.length ? [BREAK, line(`<b>Different than normal:</b> ${esc(offNormal.join(" "))}`)] : []),
    BREAK,
    line(`<b>${count} attending:</b>`),
    `<div style="line-height: 1.5;" dir="ltr"><span style="font-family: Verdana, sans-serif;">` +
      `<span style="background-color: transparent; font-size: 9pt;"><ul>${rows}</ul></span></span></div>`,
    BREAK,
    line(
      `Each new hire has been sent the invitation directly, and their supervisors have been notified separately. ` +
        `This is the one summary for the session &mdash; you are no longer copied on every individual email.`
    )
  ].join("");

  // The per-send edit. The warning goes FIRST, for the same reason as in the
  // attendee builder: everything else in the list describes the body the app
  // built, which stops being the whole story the moment somebody retypes it.
  const edited = Boolean(input.bodyOverride && input.bodyOverride.trim());
  if (edited) warnings.unshift(EDITED_SUMMARY_WARNING);

  return {
    to,
    subject: `New Hire Orientation — ${day} — ${count} attending`,
    html: edited ? cleanEditedBody(input.bodyOverride!) : built,
    bodyHtml: built,
    bodyEdited: edited,
    warnings,
    offNormal
  };
}

// --- send record -------------------------------------------------------------
// Per SESSION, not per attendee, because this email is about the cohort. Kept in a
// WorkspaceSetting like the other orientation records — no migration.

const SCOPE = "front";
const KEY = "orientation-summaries";

export type SummarySendRecord = {
  conversationId?: string;
  messageId?: string;
  sentAt: string;
  to: string;
  subject?: string;
  sentBy?: string | null;
  /** How many attendees the session had when it went. A later addition means the
      summary is stale, and the UI can say so instead of looking current. */
  attendeeCount: number;
  /** True when the body was hand-edited for that send. Optional because records
      written before the summary had an edit box cannot say either way. */
  edited?: boolean;
};

type SummaryMap = Record<string, SummarySendRecord>;

async function readSummaries(): Promise<SummaryMap> {
  const row = await prisma.workspaceSetting.findFirst({ where: { scope: SCOPE, key: KEY }, select: { valueJson: true } });
  if (!row?.valueJson) return {};
  try {
    const parsed = JSON.parse(row.valueJson) as SummaryMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function getOrientationSummaryRecord(sessionId: string): Promise<SummarySendRecord | null> {
  return (await readSummaries())[sessionId] ?? null;
}

export async function recordOrientationSummary(sessionId: string, record: SummarySendRecord): Promise<void> {
  const map = await readSummaries();
  map[sessionId] = record;
  const value = JSON.stringify(map);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: value },
    update: { valueJson: value }
  });
}
