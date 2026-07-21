import { DEFAULT_TIMEZONE } from "@/lib/calendar/timezones";

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

/** "Jul 15" — a chosen day, without the year, for dense tables. */
export function formatCalendarDayShort(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(d);
}
