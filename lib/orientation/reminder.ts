import { prisma } from "@/lib/prisma";

// Scheduling the "3. Reminder" email for the CALENDAR day before orientation —
// weekends and holidays included, because the email says "orientation is tomorrow"
// and that has to be true when it lands.
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
const RUNS_KEY = "reminder-runs";

/** How many past runs to keep. Enough to see a pattern, small enough to stay one row. */
const RUNS_KEPT = 20;

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
 * The CALENDAR day before — always, including weekends and holidays.
 *
 * This used to skip back to the previous business day, which was wrong for what
 * the email actually says: "REMINDER: orientation is tomorrow". Sent on a Friday
 * for a Monday orientation, that sentence is simply false. The user's call was
 * that a reminder landing on a Sunday is fine and being accurate matters more, so
 * there is no weekday logic left here at all — and no holiday problem either,
 * since nothing is being skipped.
 */
export function dayBefore(sessionDate: Date): Date {
  const d = new Date(sessionDate);
  d.setUTCDate(d.getUTCDate() - 1);
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

// --- the run record ---------------------------------------------------------
//
// WHY THIS EXISTS: the failure mode of this cron is SILENCE. If Vercel stops
// firing it, if CRON_SECRET goes missing (the route 503s), if arming is lost, or
// if the send day is computed a day off, the result is identical from the
// outside — no email, no error anybody sees, and a new hire turns up to an
// orientation nobody reminded them about. Nothing else in the app has that
// shape: every other cron scans and ticks internal state, so a miss is
// recoverable on the next run.
//
// So every run writes a record, INCLUDING a run that found nothing to do. The
// absence of a record for a day the cron should have run is itself the signal —
// that is the only way "it never fired" becomes visible.

export type ReminderRunRecord = {
  /** When the run happened, ISO. */
  at: string;
  /** The Mountain day it ran on — what "did it run today" is judged against. */
  dayKey: string;
  outcome: "sent" | "nothing-due" | "failed" | "crashed";
  sessionsChecked: number;
  sent: { name: string; to: string }[];
  failed: { name: string; error: string }[];
  skipped: { name: string; reason: string }[];
  /** Set only when the whole run threw rather than individual sends failing. */
  error?: string;
};

async function readRuns(): Promise<ReminderRunRecord[]> {
  const row = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key: RUNS_KEY },
    select: { valueJson: true }
  });
  if (!row?.valueJson) return [];
  try {
    const parsed = JSON.parse(row.valueJson) as unknown;
    return Array.isArray(parsed) ? (parsed as ReminderRunRecord[]) : [];
  } catch {
    return [];
  }
}

/** Newest first. */
export async function getReminderRuns(): Promise<ReminderRunRecord[]> {
  return readRuns();
}

/**
 * Append a run record, newest first, capped at RUNS_KEPT.
 *
 * Deliberately never throws: this is instrumentation, and a failure to record
 * must not turn a successful send into a crash. A swallowed error here costs a
 * missing line of history; a thrown one could cost the cohort their reminder.
 */
export async function recordReminderRun(entry: ReminderRunRecord): Promise<void> {
  try {
    const runs = await readRuns();
    const next = [entry, ...runs].slice(0, RUNS_KEPT);
    const value = JSON.stringify(next);
    await prisma.workspaceSetting.upsert({
      where: { scope_key: { scope: SCOPE, key: RUNS_KEY } },
      create: { scope: SCOPE, key: RUNS_KEY, valueJson: value },
      update: { valueJson: value }
    });
  } catch (err) {
    console.error("Could not record the orientation reminder run:", err);
  }
}

export type ReminderStatus = {
  armed: boolean;
  /** ISO date of the send day, so the UI can say exactly when it will go. */
  sendOn: string;
  sendOnLabel: string;
  /** The same day as YYYY-MM-DD in Mountain — what the dry run keys on. */
  sendOnKey: string;
  /** True when that day is today in Mountain — i.e. it fires on the next cron run. */
  dueToday: boolean;
  /** The send day has already passed. Arming now would do nothing. */
  passed: boolean;
};

export async function getReminderStatus(sessionId: string, sessionDate: Date): Promise<ReminderStatus> {
  const send = dayBefore(sessionDate);
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
    sendOnKey: sendKey,
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
  if (!due.length) {
    // Recorded, not returned quietly. "Nothing was due" and "the cron never ran"
    // look the same from outside unless this row exists.
    await recordReminderRun({
      at: new Date().toISOString(),
      dayKey: mountainDayKey(new Date()),
      outcome: "nothing-due",
      sessionsChecked: 0,
      sent: [],
      failed: [],
      skipped: []
    });
    return result;
  }

  for (const session of due) {
    const full = await prisma.orientationSession.findUnique({
      where: { id: session.id },
      select: {
        date: true,
        endsAt: true,
        address: true,
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
      location: full.location,
      address: full.address
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
          cc: email.cc.join(", "),
          subject: email.subject,
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

  await recordReminderRun({
    at: new Date().toISOString(),
    dayKey: mountainDayKey(new Date()),
    outcome: result.failed.length ? "failed" : "sent",
    sessionsChecked: result.sessionsChecked,
    sent: result.sent.map((s) => ({ name: s.name, to: s.to })),
    failed: result.failed.map((f) => ({ name: f.name, error: f.error })),
    skipped: result.skipped.map((s) => ({ name: s.name, reason: s.reason }))
  });

  return result;
}

/**
 * Every armed, still-upcoming session whose send day is the given Mountain day
 * (default today).
 *
 * The day is a parameter so the dry run can ask "what would go out on Aug 3"
 * without waiting for Aug 3 — the preview and the real run then share one
 * definition of "due", which is the only way the preview is worth trusting.
 */
export async function sessionsDueForReminder(dayKey?: string): Promise<{ id: string; date: Date }[]> {
  const armed = await readArmed();
  const ids = Object.keys(armed).filter((id) => armed[id]);
  if (!ids.length) return [];

  const sessions = await prisma.orientationSession.findMany({
    where: { id: { in: ids }, status: "UPCOMING" },
    select: { id: true, date: true }
  });

  const target = dayKey ?? mountainDayKey(new Date());
  return sessions.filter((s) => mountainDayKey(dayBefore(s.date)) === target);
}

// --- the dry run ------------------------------------------------------------

export type ReminderPreviewRecipient = {
  attendeeId: string;
  name: string;
  /** What would happen: an email, or a skip with the reason. */
  action: "would-send" | "would-skip";
  reason?: string;
  to: string[];
  cc: string[];
  subject: string;
  /** Anything the template builder flagged — a missing address, say. */
  warnings: string[];
};

export type ReminderPreview = {
  dayKey: string;
  sessions: {
    sessionId: string;
    dateLabel: string;
    location: string | null;
    recipients: ReminderPreviewRecipient[];
  }[];
  wouldSend: number;
  wouldSkip: number;
};

/**
 * Exactly what the cron WOULD do on a given Mountain day, sending nothing.
 *
 * This builds the real emails through the same buildOrientationEmail the send
 * path uses, so the addresses and subject shown here are the ones that would
 * actually go out — not a re-implementation that could drift from it.
 */
export async function previewDueReminders(dayKey?: string): Promise<ReminderPreview> {
  const { buildOrientationEmail } = await import("@/lib/front/orientation-email");

  const target = dayKey ?? mountainDayKey(new Date());
  const due = await sessionsDueForReminder(target);
  const preview: ReminderPreview = { dayKey: target, sessions: [], wouldSend: 0, wouldSkip: 0 };

  for (const session of due) {
    const full = await prisma.orientationSession.findUnique({
      where: { id: session.id },
      select: {
        date: true,
        endsAt: true,
        address: true,
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
      location: full.location,
      address: full.address
    };

    const recipients: ReminderPreviewRecipient[] = [];
    for (const a of full.attendees) {
      let keys: string[] = [];
      try {
        const parsed = JSON.parse(a.sentTemplateKeys) as unknown;
        keys = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
      } catch {
        keys = [];
      }
      if (keys.includes("reminder")) {
        recipients.push({
          attendeeId: a.id,
          name: a.newHire.name,
          action: "would-skip",
          reason: "already had the reminder",
          to: [],
          cc: [],
          subject: "",
          warnings: []
        });
        preview.wouldSkip += 1;
        continue;
      }

      try {
        const email = await buildOrientationEmail("reminder", a.newHire, sessionForEmail);
        recipients.push({
          attendeeId: a.id,
          name: a.newHire.name,
          action: "would-send",
          to: email.to,
          cc: email.cc,
          subject: email.subject,
          warnings: email.warnings ?? []
        });
        preview.wouldSend += 1;
      } catch (err) {
        // A build failure here is a send failure on the day — surface it as such
        // rather than letting the preview look clean.
        recipients.push({
          attendeeId: a.id,
          name: a.newHire.name,
          action: "would-skip",
          reason: err instanceof Error ? err.message : "Could not build the email.",
          to: [],
          cc: [],
          subject: "",
          warnings: ["This would fail on the day."]
        });
        preview.wouldSkip += 1;
      }
    }

    preview.sessions.push({
      sessionId: session.id,
      dateLabel: new Intl.DateTimeFormat("en-US", {
        timeZone: ZONE,
        weekday: "long",
        month: "long",
        day: "numeric"
      }).format(full.date),
      location: full.location,
      recipients
    });
  }

  return preview;
}

// --- health -----------------------------------------------------------------

export type ReminderHealth = {
  /** Mountain day this was evaluated on. */
  today: string;
  /** A send is expected today and has not been recorded yet. */
  overdueToday: boolean;
  /** The cron has a run recorded for today. */
  ranToday: boolean;
  lastRun: ReminderRunRecord | null;
  /** Every armed session, whether or not it is due. */
  armed: {
    sessionId: string;
    dateLabel: string;
    sendOnKey: string;
    attendeeCount: number;
    /** Attendees who have not had the reminder yet. */
    pendingCount: number;
    status: string;
  }[];
  /** Config that has to be right for the cron to send anything at all. */
  config: { cronSecret: boolean; frontToken: boolean; channel: string | null; channelError: string | null };
  /** Plain-English problems, worst first. Empty means nothing found. */
  problems: string[];
};

/**
 * Everything needed to answer "will the reminder go out, and did it".
 *
 * Read-only and safe to call any time — it sends nothing and writes nothing.
 */
export async function getReminderHealth(): Promise<ReminderHealth> {
  const today = mountainDayKey(new Date());
  const runs = await readRuns();
  const lastRun = runs[0] ?? null;
  const ranToday = runs.some((r) => r.dayKey === today);

  const armedMap = await readArmed();
  const armedIds = Object.keys(armedMap).filter((id) => armedMap[id]);
  const sessions = armedIds.length
    ? await prisma.orientationSession.findMany({
        where: { id: { in: armedIds } },
        select: {
          id: true,
          date: true,
          status: true,
          attendees: { select: { sentTemplateKeys: true } }
        }
      })
    : [];

  const armed = sessions.map((s) => {
    const pending = s.attendees.filter((a) => {
      try {
        const parsed = JSON.parse(a.sentTemplateKeys) as unknown;
        return !(Array.isArray(parsed) && parsed.includes("reminder"));
      } catch {
        return true;
      }
    }).length;
    return {
      sessionId: s.id,
      dateLabel: new Intl.DateTimeFormat("en-US", {
        timeZone: ZONE,
        weekday: "long",
        month: "long",
        day: "numeric"
      }).format(s.date),
      sendOnKey: mountainDayKey(dayBefore(s.date)),
      attendeeCount: s.attendees.length,
      pendingCount: pending,
      status: s.status
    };
  });

  const dueToday = armed.filter((a) => a.sendOnKey === today && a.status === "UPCOMING" && a.pendingCount > 0);
  const overdueToday = dueToday.length > 0 && !ranToday;

  let channel: string | null = null;
  let channelError: string | null = null;
  try {
    const { getOrientationChannelId } = await import("@/lib/front/config");
    channel = await getOrientationChannelId();
  } catch (err) {
    channelError = err instanceof Error ? err.message : "Could not resolve the Front channel.";
  }

  const config = {
    cronSecret: Boolean(process.env.CRON_SECRET),
    frontToken: Boolean(process.env.FRONT_API_TOKEN),
    channel,
    channelError
  };

  const problems: string[] = [];
  if (overdueToday) {
    problems.push(
      `A reminder is due today (${today}) and no run has been recorded. The cron may not be firing — send "3. Reminder" by hand if the day is nearly over.`
    );
  }
  // Only in production. CRON_SECRET is a Vercel variable and is absent from every
  // local .env by design, so reporting it locally would put a permanent red box in
  // front of developers for a condition that is only ever real in prod — and a
  // warning that is always on is a warning nobody reads.
  if (!config.cronSecret && process.env.NODE_ENV === "production") {
    problems.push("CRON_SECRET is not set, so the cron route refuses every request and nothing will ever send.");
  }
  if (!config.frontToken) {
    problems.push("FRONT_API_TOKEN is not set, so no email can be sent.");
  }
  if (config.channelError) {
    problems.push(`The send-from mailbox could not be resolved: ${config.channelError}`);
  }
  for (const a of armed) {
    if (a.status !== "UPCOMING") {
      problems.push(
        `Session on ${a.dateLabel} is armed but its status is ${a.status}, and only UPCOMING sessions are sent — its reminder will never go out.`
      );
    }
    if (a.sendOnKey < today && a.pendingCount > 0) {
      problems.push(`Session on ${a.dateLabel} had its send day (${a.sendOnKey}) pass with ${a.pendingCount} still unsent.`);
    }
  }
  if (lastRun?.failed.length) {
    problems.push(
      `The last run failed for ${lastRun.failed.length} recipient(s): ${lastRun.failed.map((f) => `${f.name} (${f.error})`).join("; ")}`
    );
  }
  if (lastRun?.outcome === "crashed") {
    problems.push(`The last run crashed: ${lastRun.error ?? "no detail recorded"}`);
  }

  return { today, overdueToday, ranToday, lastRun, armed, config, problems };
}
