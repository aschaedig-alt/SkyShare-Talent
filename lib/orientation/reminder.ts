import { prisma } from "@/lib/prisma";

// Scheduling the "3. Reminder" email for one business day before orientation.
//
// ARMED PER SESSION, deliberately. This is the first thing in the app that would
// email a real new hire with nobody watching — every existing cron scans and ticks
// internal state, which is a different risk entirely. So automation is opt-in on
// the session you choose, not a global default someone inherits by accident.
//
// Armed state lives in a WorkspaceSetting rather than a new column, following the
// orientation-sends and calendar-events precedent: no migration against the shared
// live database for what is one boolean per session.

const SCOPE = "orientation";
const KEY = "reminder-armed";

const ZONE = "America/Denver";

/** YYYY-MM-DD as read in Mountain — the only day that matters for "is it due". */
export function mountainDayKey(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d);
  return parts; // en-CA gives YYYY-MM-DD
}

/**
 * One BUSINESS day before — Tuesday orientation sends Monday, Monday sends Friday.
 *
 * Weekends only. Public holidays are NOT handled: the app has no holiday calendar,
 * and silently guessing at one would be worse than the user knowing it doesn't.
 * If orientation falls the day after a holiday, send it by hand.
 */
export function oneBusinessDayBefore(sessionDate: Date): Date {
  const d = new Date(sessionDate);
  d.setUTCDate(d.getUTCDate() - 1);
  // 0 = Sunday, 6 = Saturday, read in Mountain so a UTC-evening instant doesn't
  // land on the wrong weekday.
  for (let guard = 0; guard < 7; guard++) {
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "short" }).format(d);
    if (weekday !== "Sat" && weekday !== "Sun") break;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d;
}

type ArmedMap = Record<string, boolean>;

async function readArmed(): Promise<ArmedMap> {
  const row = await prisma.workspaceSetting.findFirst({ where: { scope: SCOPE, key: KEY }, select: { valueJson: true } });
  if (!row?.valueJson) return {};
  try {
    const parsed = JSON.parse(row.valueJson) as ArmedMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function isReminderArmed(sessionId: string): Promise<boolean> {
  return Boolean((await readArmed())[sessionId]);
}

export async function setReminderArmed(sessionId: string, armed: boolean): Promise<boolean> {
  const map = await readArmed();
  if (armed) map[sessionId] = true;
  else delete map[sessionId];
  const value = JSON.stringify(map);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: value },
    update: { valueJson: value }
  });
  return armed;
}

export type ReminderStatus = {
  armed: boolean;
  /** ISO date of the send day, so the UI can say exactly when it will go. */
  sendOn: string;
  sendOnLabel: string;
  /** True when that day is today in Mountain — i.e. it fires on the next cron run. */
  dueToday: boolean;
  /** The send day has already passed. Arming now would do nothing. */
  passed: boolean;
};

export async function getReminderStatus(sessionId: string, sessionDate: Date): Promise<ReminderStatus> {
  const send = oneBusinessDayBefore(sessionDate);
  const todayKey = mountainDayKey(new Date());
  const sendKey = mountainDayKey(send);
  return {
    armed: await isReminderArmed(sessionId),
    sendOn: send.toISOString(),
    sendOnLabel: new Intl.DateTimeFormat("en-US", {
      timeZone: ZONE,
      weekday: "long",
      month: "long",
      day: "numeric"
    }).format(send),
    dueToday: sendKey === todayKey,
    passed: sendKey < todayKey
  };
}

export type ReminderRunResult = {
  sessionsChecked: number;
  sent: { sessionId: string; name: string; to: string }[];
  failed: { sessionId: string; name: string; error: string }[];
  skipped: { sessionId: string; name: string; reason: string }[];
};

/**
 * Send the reminder for every armed session that is due today.
 *
 * Called by the cron, which authenticates with CRON_SECRET — so there is no signed-in
 * user and no interactive permission check here. That is exactly why arming is
 * per-session and opt-in: this function will email real new hires with nobody
 * watching, and the only thing standing between it and a mistake is that somebody
 * deliberately armed that one session.
 *
 * Idempotent: an attendee who already has the reminder recorded is skipped, so a
 * double cron run (or a manual send earlier the same day) cannot email twice.
 */
export async function runDueReminders(): Promise<ReminderRunResult> {
  // Imported here rather than at module scope to keep this file loadable from the
  // client-safe side of the app (the UI reads ReminderStatus types from it).
  const { buildOrientationEmail, recordOrientationSend } = await import("@/lib/front/orientation-email");
  const { getOrientationChannelId } = await import("@/lib/front/config");
  const { sendEmail } = await import("@/lib/front/messages");

  const due = await sessionsDueForReminder();
  const result: ReminderRunResult = { sessionsChecked: due.length, sent: [], failed: [], skipped: [] };
  if (!due.length) return result;

  for (const session of due) {
    const full = await prisma.orientationSession.findUnique({
      where: { id: session.id },
      select: {
        date: true,
        endsAt: true,
        location: true,
        attendees: {
          select: {
            id: true,
            sentTemplateKeys: true,
            newHire: {
              select: {
                name: true,
                ssEmail: true,
                personalEmail: true,
                supervisorName: true,
                supervisorEmail: true,
                supervisorHire: { select: { name: true, ssEmail: true, personalEmail: true } },
                supervisor2Name: true,
                supervisor2Email: true,
                supervisor2Hire: { select: { name: true, ssEmail: true, personalEmail: true } }
              }
            }
          }
        }
      }
    });
    if (!full) continue;

    const sessionForEmail = {
      date: full.date.toISOString(),
      endsAt: full.endsAt ? full.endsAt.toISOString() : null,
      location: full.location
    };
    const channelId = await getOrientationChannelId();

    for (const a of full.attendees) {
      let keys: string[] = [];
      try {
        const parsed = JSON.parse(a.sentTemplateKeys) as unknown;
        keys = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
      } catch {
        keys = [];
      }
      if (keys.includes("reminder")) {
        result.skipped.push({ sessionId: session.id, name: a.newHire.name, reason: "already had the reminder" });
        continue;
      }

      try {
        const email = await buildOrientationEmail("reminder", a.newHire, sessionForEmail);
        const res = await sendEmail(channelId, {
          to: email.to,
          cc: email.cc,
          subject: email.subject,
          body: email.html,
          archive: false
        });
        await recordOrientationSend(a.id, "reminder", {
          conversationId: res.conversationId,
          messageId: res.id,
          sentAt: new Date().toISOString(),
          to: email.to.join(", "),
          sentBy: "scheduled reminder"
        });
        await prisma.orientationAttendee.update({
          where: { id: a.id },
          data: { sentTemplateKeys: JSON.stringify([...keys, "reminder"]) }
        });
        result.sent.push({ sessionId: session.id, name: a.newHire.name, to: email.to.join(", ") });
      } catch (err) {
        // One bad address must not stop the rest of the cohort being reminded.
        result.failed.push({
          sessionId: session.id,
          name: a.newHire.name,
          error: err instanceof Error ? err.message : "Send failed."
        });
      }
    }
  }

  return result;
}

/** Every armed, still-upcoming session whose send day is today. */
export async function sessionsDueForReminder(): Promise<{ id: string; date: Date }[]> {
  const armed = await readArmed();
  const ids = Object.keys(armed).filter((id) => armed[id]);
  if (!ids.length) return [];

  const sessions = await prisma.orientationSession.findMany({
    where: { id: { in: ids }, status: "UPCOMING" },
    select: { id: true, date: true }
  });

  const todayKey = mountainDayKey(new Date());
  return sessions.filter((s) => mountainDayKey(oneBusinessDayBefore(s.date)) === todayKey);
}
