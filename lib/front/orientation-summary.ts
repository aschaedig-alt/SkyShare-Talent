import { prisma } from "@/lib/prisma";
import { getOrientationCc } from "@/lib/orientation/email-cc";
import { formatTimeRange } from "@/lib/calendar/format";
import { ordinalDayLabel } from "@/lib/dates/ordinal";
import { nameList } from "./orientation-email";

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
  html: string;
  warnings: string[];
};

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
  address: string;
  attendees: SummaryAttendee[];
  /** Override the recipients — used by a test send. */
  testTo?: string | null;
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

  const html = [
    line(`New Hire Orientation is on <b>${esc(day)}</b>, ${esc(when)}, at ${esc(input.address)}.`),
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

  return {
    to,
    subject: `New Hire Orientation — ${day} — ${count} attending`,
    html,
    warnings
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
