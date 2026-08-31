import { DEFAULT_TIMEZONE } from "@/lib/calendar/timezones";
import { zonedWallClockToUtc } from "@/lib/booking/timezone";

/**
 * Two kinds of date live in this database, and they must be displayed differently.
 * Mixing them up is the bug behind "the offer says it was signed tomorrow".
 *
 * 1. A MOMENT — when something actually happened. offerSignedAt, offerSentAt, a
 *    flight's startsAt, any completedAt. Written as new Date(), so it carries a
 *    real time of day. Render it in the OFFICE timezone (Mountain): someone in
 *    Salt Lake who signs an offer at 6:10pm on the 20th must see the 20th, not
 *    the 21st. Rendering these in UTC is wrong by six or seven hours, which
 *    silently becomes wrong by a whole DAY every evening.
 *
 * 2. A CALENDAR DAY — a day someone chose, with no time of day. startDate,
 *    orientationDate, birthday, offerStartDate. Stored at midnight UTC, so it
 *    must be rendered in UTC: converting midnight UTC to Mountain lands at 6pm
 *    the PREVIOUS day, and a start date of the 15th displays as the 14th.
 *
 * So: never reach for Intl.DateTimeFormat directly for these. Pick the function
 * whose name matches what the value MEANS, and the timezone takes care of itself.
 */

const OFFICE_TZ = DEFAULT_TIMEZONE; // America/Denver

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

/* -- 1. Moments: render in the office timezone --------------------------- */

/** "Jul 20, 2026" — the date this happened, as seen from the office. */
export function formatMomentDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: OFFICE_TZ,
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(d);
}

/** "Jul 20" — the date this happened, without the year, for dense tables. */
export function formatMomentDateShort(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: OFFICE_TZ, month: "short", day: "numeric" }).format(d);
}

/** "6:10 PM" — the time this happened, as seen from the office. */
export function formatMomentTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: OFFICE_TZ,
    hour: "numeric",
    minute: "2-digit"
  }).format(d);
}

/**
 * "9:37a" — the office-local time, as short as it can be and still unambiguous.
 *
 * For calendar chips, where the whole label has to fit inside one day cell next
 * to a route like DEN→SLC. The am/pm marker is a single letter rather than " AM"
 * because dropping it entirely makes a 9:37 departure and a 9:37 arrival
 * indistinguishable, and an eight-character time does not fit.
 */
export function formatMomentTimeCompact(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: OFFICE_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).formatToParts(d);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "";
  const period = (parts.find((p) => p.type === "dayPeriod")?.value ?? "").toLowerCase().slice(0, 1);
  return `${hour}:${minute}${period}`;
}

/** "Jul 20, 6:10 PM" — both, for when the day alone is ambiguous. */
export function formatMomentDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: OFFICE_TZ,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(d);
}

/**
 * "Jul 20, 2026, 6:10 PM" — both, WITH the year.
 *
 * Same as formatMomentDateTime but keeping the year, which the candidate
 * timeline and notes both show. It exists so those two could be moved off their
 * own timezone-less Intl.DateTimeFormat without changing what they display: the
 * bug was the missing timeZone, not the format.
 */
export function formatMomentDateTimeLong(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: OFFICE_TZ,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(d);
}

/* -- 2. Calendar days: render in UTC, where they were stored ------------- */

/** "Jul 15, 2026" — a chosen day. Stored at midnight UTC, so read back in UTC. */
export function formatCalendarDay(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(d);
}

/**
 * Turn a MOMENT into the CALENDAR DAY it fell on in the office timezone, stored
 * the way calendar days are stored (midnight UTC).
 *
 * Use this when copying a timestamp into a date-only column — an offer's signedAt
 * into a hire's offerSignedDate, say. Copying the raw instant instead puts a time
 * of day into a column everything else renders in UTC, so an evening signature
 * silently lands on the next day.
 */
export function toCalendarDay(value: string | Date | null | undefined): Date | null {
  const d = toDate(value);
  if (!d) return null;
  // en-CA gives yyyy-mm-dd, which is exactly the shape we need back.
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: OFFICE_TZ }).format(d);
  return new Date(`${day}T00:00:00.000Z`);
}

/**
 * "2026-08-03" — which DAY this moment falls on, as seen from the office.
 *
 * Use instead of toISOString().slice(0,10) anywhere a moment is bucketed by day.
 * The ISO form gives the UTC day, so an 8pm Mountain departure is already
 * tomorrow in UTC and lands on the wrong square of a calendar.
 */
export function officeDayKey(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  // en-CA formats as yyyy-mm-dd, which is exactly the key shape we want.
  return new Intl.DateTimeFormat("en-CA", { timeZone: OFFICE_TZ }).format(d);
}

/**
 * Midnight on `dayKey` ("2026-08-03") in the office timezone, as an instant.
 *
 * How a date with NO time is stored: a travel item often has a known day and an
 * unknown departure time, and requiring a time to record the day at all is what
 * made those items invisible to the calendar.
 */
export function startOfOfficeDay(dayKey: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) return null;
  // Reuse the booking module's converter rather than re-deriving the offset — it
  // already refines across DST transitions, and hand-rolling this got the sign
  // wrong in both directions on the first attempt.
  return zonedWallClockToUtc(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, OFFICE_TZ);
}

/**
 * Does this moment carry a real time of day, or is it a day-only record?
 *
 * A value sitting exactly at midnight in the office timezone is one we stored
 * from a date with no time. A genuine midnight departure is vanishingly rare, and
 * the alternative — a schema column just to flag it — is not worth a migration.
 */
export function hasTimeOfDay(value: string | Date | null | undefined): boolean {
  const d = toDate(value);
  if (!d) return false;
  const hm = new Intl.DateTimeFormat("en-US", {
    timeZone: OFFICE_TZ,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit"
  }).format(d);
  return hm !== "00:00" && hm !== "24:00";
}

/**
 * Is this value a CALENDAR DAY rather than a moment — i.e. stored at midnight UTC?
 *
 * The two kinds documented at the top of this file are indistinguishable by type,
 * and travel holds BOTH in the same column: a flight's startsAt is a real moment,
 * but a date recovered from booking text ("Thu 16Jul2026") and orientationDate are
 * calendar days written at midnight UTC. Reading one of those in Mountain time
 * lands at 6pm the PREVIOUS day — which drew a Jul 16 flight on Jul 15 and gave it
 * a departure time of 6:00 PM that nobody ever entered.
 *
 * Caveat, same one hasTimeOfDay already accepts: a genuine departure at exactly
 * midnight UTC (6pm Mountain) reads as a calendar day. Vanishingly rare, and far
 * cheaper than a schema column to disambiguate.
 */
export function isStoredCalendarDay(value: string | Date | null | undefined): boolean {
  const d = toDate(value);
  if (!d) return false;
  return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
}

/**
 * "2026-07-16" — the day this belongs on, whichever kind of value it is.
 *
 * Calendar days are read in UTC where they were written; moments are read in the
 * office timezone. Use this for anything placed on a calendar grid, where getting
 * it wrong moves the item to the wrong square.
 */
export function dayKeyOf(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  return isStoredCalendarDay(d) ? d.toISOString().slice(0, 10) : officeDayKey(d);
}

/**
 * The clock time to show, or null when the value carries none.
 *
 * Returns null for a calendar day rather than "12:00 AM" or, worse, the 6:00 PM
 * that a UTC midnight becomes in Mountain time.
 */
export function clockTimeOf(value: string | Date | null | undefined): string | null {
  const d = toDate(value);
  if (!d || isStoredCalendarDay(d) || !hasTimeOfDay(d)) return null;
  return formatMomentTimeCompact(d);
}

/** "09:37" — the 24-hour office-local time, shaped for an <input type="time">. */
export function officeTimeValue(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: OFFICE_TZ, hour12: false, hour: "2-digit", minute: "2-digit" }).format(d);
}

/** The office timezone, for callers that must build a wall-clock instant. */
export const OFFICE_TIMEZONE = OFFICE_TZ;

/** "Jul 15" — a chosen day, without the year, for dense tables. */
export function formatCalendarDayShort(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(d);
}
