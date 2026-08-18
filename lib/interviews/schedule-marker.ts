import { prisma } from "@/lib/prisma";
import { getUserCalendar } from "@/lib/google/user-calendar";
import { denverDayKey } from "@/lib/interviews/debrief";

/**
 * The "SCHEDULE" marker — a to-do on the shared recruiting calendar saying this
 * candidate still needs booking for the next step.
 *
 * This is a convention the recruiter was already keeping by hand; the shape here
 * was copied from a real example she made rather than invented. See the notes on
 * each constant for what is deliberate.
 */

/**
 * The shared "SkyShare Recruiting" calendar. Overridable, but hard-coding the
 * default is correct: it is a fixed workspace calendar, and an unset env var
 * should not silently drop these onto somebody's personal calendar instead.
 */
export const RECRUITING_CALENDAR_ID =
  process.env.RECRUITING_CALENDAR_ID?.trim() ||
  "c_f7e82cf2276ed74f71db4781741bff720b8ed1cc76c7e27498f29058d50a30fa@group.calendar.google.com";

/** Tomato. The interview events themselves are colorId 3, so red reads as "action needed". */
export const SCHEDULE_MARKER_COLOR_ID = "11";

export type ScheduleMarkerResult = {
  ok: boolean;
  message: string;
  htmlLink: string | null;
  meetUrl: string | null;
  /** False when the candidate has no Paycom URL stored — the event is still made. */
  hadPaycomLink: boolean;
};

/**
 * 45 minutes, from 5pm Mountain, on the SAME DAY as the interview.
 *
 * All three parts are the user's own call. The first hand-made example sat at
 * 05:00-05:45 the following morning, but that slot was incidental; asked to pick
 * something better, he chose a real timed block after the working day on the
 * interview's own date, which he then drags to wherever it belongs. So it is
 * BUSY rather than free — it becomes actual booked work, not a sticky note — and
 * the 45 minutes is deliberate, not a default.
 */
export const MARKER_START_HOUR_MT = 17;
export const MARKER_DURATION_MINUTES = 45;

export async function createScheduleMarker(options: {
  ownerEmail: string | null | undefined;
  candidateId?: string | null;
  name: string;
  role?: string | null;
  /** The interview's own date — the marker lands the same evening. */
  onDate?: Date;
}): Promise<ScheduleMarkerResult> {
  const access = await getUserCalendar(options.ownerEmail);
  if (!access.client) {
    return {
      ok: false,
      message: access.blocker ?? "The calendar could not be reached.",
      htmlLink: null,
      meetUrl: null,
      hadPaycomLink: false,
    };
  }

  // The Paycom URL cannot be derived — it carries a per-application hash on some
  // records and not others, so guessing one risks pointing at the wrong
  // applicant. Use the stored link or leave the description empty; never build one.
  let paycomLink: string | null = null;
  if (options.candidateId) {
    const candidate = await prisma.candidate.findUnique({
      where: { id: options.candidateId },
      select: { paycomLink: true },
    });
    paycomLink = candidate?.paycomLink ?? null;
  }

  // Local wall-clock strings plus an explicit timeZone, rather than a computed
  // UTC offset: Google resolves Mountain daylight saving itself, so this cannot
  // drift by an hour twice a year the way a hard-coded -06:00 would.
  const dayKey = denverDayKey(options.onDate ?? new Date());
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = (minutes: number) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
  const startMinutes = MARKER_START_HOUR_MT * 60;
  const startLocal = `${dayKey}T${clock(startMinutes)}:00`;
  const endLocal = `${dayKey}T${clock(startMinutes + MARKER_DURATION_MINUTES)}:00`;

  const role = options.role?.trim();
  const summary = `SCHEDULE ${options.name.trim()}${role ? ` - ${role}` : ""}`;

  try {
    const response = await access.client.events.insert({
      calendarId: RECRUITING_CALENDAR_ID,
      conferenceDataVersion: 1,
      sendUpdates: "none",
      requestBody: {
        summary,
        description: paycomLink ? `<a href="${paycomLink}">${paycomLink}</a>` : undefined,
        colorId: SCHEDULE_MARKER_COLOR_ID,
        start: { dateTime: startLocal, timeZone: "America/Denver" },
        end: { dateTime: endLocal, timeZone: "America/Denver" },
        // No attendees, deliberately — this is a note to ourselves, and adding
        // the candidate would email them an invitation to their own admin task.
        attendees: [],
        conferenceData: {
          createRequest: {
            requestId: `schedule-marker-${options.candidateId ?? "adhoc"}-${Date.now()}`,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      },
    });

    return {
      ok: true,
      message: paycomLink
        ? "Added to the recruiting calendar."
        : "Added to the recruiting calendar, with no Paycom link stored for this candidate.",
      htmlLink: response.data.htmlLink ?? null,
      meetUrl: response.data.hangoutLink ?? null,
      hadPaycomLink: Boolean(paycomLink),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      ok: false,
      message: `Google refused to create the event: ${message}`,
      htmlLink: null,
      meetUrl: null,
      hadPaycomLink: Boolean(paycomLink),
    };
  }
}
