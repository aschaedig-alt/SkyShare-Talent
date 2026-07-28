import { prisma } from "@/lib/prisma";
import { addInviteAttendees, createInviteEvent, getInviteEvent } from "@/lib/google/calendar";
import { getUserCalendar } from "@/lib/google/user-calendar";
import { buildOrientationEvent, type OrientationEventDraft } from "./calendar-event";

// Creating the orientation calendar invite from the app, and adding the session's
// attendees to it as guests.
//
// Two SEPARATE steps on purpose, mirroring how the user actually works: create the
// event first and look at it, then invite people once it is right. Creating is
// silent (sendUpdates none, no attendees); adding guests is the irreversible one
// that emails seven real new hires, so it is never a side effect of the first.
//
// The event id is kept in a WorkspaceSetting rather than a new column, following
// lib/front/orientation-email.ts — no migration against the shared live database
// for what is essentially a pointer.

const SCOPE = "orientation";
const KEY = "calendar-events";

/** The calendar to create on. "primary" is the SIGNED-IN USER'S own calendar,
    which is where an orientation invite belongs — it should come from the person
    running it, not from a robot account. Consequence worth stating: the event
    belongs to whoever clicks, so if two people use the button you get two
    different organizers. Set ORIENTATION_CALENDAR_ID to force one shared target
    (everyone using it then needs edit rights on that calendar). */
function targetCalendarId(): string {
  return process.env.ORIENTATION_CALENDAR_ID?.trim() || "primary";
}

export type OrientationCalendarRecord = {
  eventId: string;
  calendarId: string;
  htmlLink: string | null;
  hangoutLink: string | null;
  createdAt: string;
  createdBy?: string | null;
};

type CalendarMap = Record<string, OrientationCalendarRecord>;

async function readMap(): Promise<CalendarMap> {
  const row = await prisma.workspaceSetting.findFirst({ where: { scope: SCOPE, key: KEY }, select: { valueJson: true } });
  if (!row?.valueJson) return {};
  try {
    const parsed = JSON.parse(row.valueJson) as CalendarMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeRecord(sessionId: string, record: OrientationCalendarRecord): Promise<void> {
  const map = await readMap();
  map[sessionId] = record;
  const value = JSON.stringify(map);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: value },
    update: { valueJson: value }
  });
}

export async function getOrientationCalendarRecord(sessionId: string): Promise<OrientationCalendarRecord | null> {
  return (await readMap())[sessionId] ?? null;
}

// --- attendees --------------------------------------------------------------

export type AttendeeEmail = {
  name: string;
  email: string | null;
  /** Which field it came from, so the UI can warn about personal addresses. */
  source: "company" | "personal" | "none";
};

async function sessionAttendeeEmails(sessionId: string): Promise<AttendeeEmail[]> {
  const rows = await prisma.orientationAttendee.findMany({
    where: { sessionId },
    select: { newHire: { select: { name: true, ssEmail: true, personalEmail: true } } }
  });
  return rows.map((r) => {
    const ss = r.newHire.ssEmail?.trim();
    const personal = r.newHire.personalEmail?.trim();
    if (ss) return { name: r.newHire.name, email: ss, source: "company" as const };
    if (personal) return { name: r.newHire.name, email: personal, source: "personal" as const };
    return { name: r.newHire.name, email: null, source: "none" as const };
  });
}

// --- preview ----------------------------------------------------------------

export type OrientationCalendarPreview = {
  draft: OrientationEventDraft;
  attendees: AttendeeEmail[];
  /** Already created? Then this holds what is really on the event in Google. */
  existing: (OrientationCalendarRecord & { liveAttendees: string[]; missingInGoogle: boolean }) | null;
  /** Non-null when the app cannot talk to Google at all — shown instead of a dead button. */
  blocker: string | null;
};

async function loadSession(sessionId: string) {
  const s = await prisma.orientationSession.findUnique({
    where: { id: sessionId },
    select: { date: true, endsAt: true, location: true, address: true }
  });
  if (!s) throw new Error("Session not found.");
  return {
    date: s.date.toISOString(),
    endsAt: s.endsAt?.toISOString() ?? null,
    location: s.location,
    address: s.address
  };
}

export async function previewOrientationCalendar(
  sessionId: string,
  actingUserEmail: string | null
): Promise<OrientationCalendarPreview> {
  const session = await loadSession(sessionId);
  const draft = buildOrientationEvent(session);
  const attendees = await sessionAttendeeEmails(sessionId);

  const noEmail = attendees.filter((a) => !a.email).map((a) => a.name);
  if (noEmail.length) {
    draft.warnings.push(`No email on file for ${noEmail.join(", ")} — they cannot be invited until one is added.`);
  }
  const personal = attendees.filter((a) => a.source === "personal").map((a) => a.name);
  if (personal.length) {
    draft.warnings.push(
      `${personal.join(", ")} have no SkyShare address, so the invite would go to a personal one. The invitation email tells them it went to their company email.`
    );
  }

  const access = await getUserCalendar(actingUserEmail);
  const record = await getOrientationCalendarRecord(sessionId);
  let existing: OrientationCalendarPreview["existing"] = null;
  if (record) {
    let live: Awaited<ReturnType<typeof getInviteEvent>> = null;
    let reachable = false;
    if (access.client) {
      reachable = true;
      try {
        live = await getInviteEvent(access.client, record.calendarId, record.eventId);
      } catch {
        // A read failure is not proof the event is gone — don't claim it is.
        reachable = false;
      }
    }
    existing = {
      ...record,
      liveAttendees: live?.attendees ?? [],
      // Only assert "deleted in Google" when we actually got an answer back.
      missingInGoogle: reachable && live === null
    };
  }

  return { draft, attendees, existing, blocker: access.blocker };
}

// --- the two actions --------------------------------------------------------

/** Create the event with NO guests. Silent: nobody is emailed. */
export async function createOrientationCalendarEvent(
  sessionId: string,
  actingUserEmail: string | null
): Promise<OrientationCalendarRecord> {
  const access = await getUserCalendar(actingUserEmail);
  if (!access.client) throw new Error(access.blocker ?? "Google Calendar is unavailable.");

  const existing = await getOrientationCalendarRecord(sessionId);
  if (existing) {
    throw new Error("This session already has a calendar event. Open it in Google, or remove the link first.");
  }

  const session = await loadSession(sessionId);
  const draft = buildOrientationEvent(session);
  const calendarId = targetCalendarId();

  const created = await createInviteEvent(
    access.client,
    calendarId,
    {
      summary: draft.summary,
      description: draft.description,
      location: draft.location,
      startTime: draft.startTime,
      endTime: draft.endTime,
      timeZone: draft.timeZone,
      colorId: draft.colorId,
      addMeet: true
    },
    "none"
  );

  const record: OrientationCalendarRecord = {
    eventId: created.id,
    calendarId,
    htmlLink: created.htmlLink,
    hangoutLink: created.hangoutLink,
    createdAt: new Date().toISOString(),
    // Who owns it, which matters here: with per-user OAuth the organizer is
    // whoever clicked, so the record has to say who that was.
    createdBy: access.email
  };
  await writeRecord(sessionId, record);
  return record;
}

/**
 * Add the session's attendees as guests. THIS EMAILS REAL PEOPLE — sendUpdates
 * is "all" deliberately, because a guest who is never told is worse than not
 * being invited.
 */
export async function addOrientationAttendeesToEvent(
  sessionId: string,
  actingUserEmail: string | null
): Promise<{ added: string[]; alreadyThere: string[]; skipped: string[]; total: number }> {
  const access = await getUserCalendar(actingUserEmail);
  if (!access.client) throw new Error(access.blocker ?? "Google Calendar is unavailable.");

  const record = await getOrientationCalendarRecord(sessionId);
  if (!record) throw new Error("No calendar event for this session yet — create the invite first.");

  const attendees = await sessionAttendeeEmails(sessionId);
  const emails = attendees.map((a) => a.email).filter((e): e is string => Boolean(e));
  const skipped = attendees.filter((a) => !a.email).map((a) => a.name);

  if (emails.length === 0) {
    throw new Error("None of this session's attendees have an email address on file.");
  }

  const res = await addInviteAttendees(access.client, record.calendarId, record.eventId, emails, "all");
  return { ...res, skipped };
}
