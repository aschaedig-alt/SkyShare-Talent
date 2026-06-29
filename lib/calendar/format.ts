import { timezoneAbbr, resolveTimezone, DEFAULT_TIMEZONE } from "@/lib/calendar/timezones";
import { zonedWallClockToUtc } from "@/lib/booking/timezone";

/**
 * Canonical date/time formatting for the whole app.
 *
 * Every formatter renders IN a timezone (defaulting to Mountain) and labels the
 * zone with ONE consistent style via {@link zoneLabel} — "MT", "ET", etc. — so
 * the site never mixes "Mountain" and "MT". Pass an interview/booking's own
 * timezone to honor non-default zones; omit it to use Mountain.
 */

function toDate(value: string | Date): Date {
  return typeof value === "string" ? new Date(value) : value;
}

function tz(timezone?: string | null): string {
  return resolveTimezone(timezone);
}

/** Consistent short zone label: known US zones -> "MT"/"ET"; otherwise a short fallback. */
export function zoneLabel(timezone?: string | null): string {
  const zone = tz(timezone);
  const abbr = timezoneAbbr(zone);
  // timezoneAbbr returns the raw IANA string when it isn't a known US zone.
  if (abbr && abbr !== zone) return abbr;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

/** "Mon, Jun 9" */
export function formatDateShort(value: string | Date, timezone?: string | null): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz(timezone),
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(toDate(value));
}

/** "Monday, June 9, 2026" */
export function formatDateLong(value: string | Date, timezone?: string | null): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz(timezone),
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(toDate(value));
}

/** "9:00 AM" (rendered in the given zone) */
export function formatTime(value: string | Date, timezone?: string | null): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz(timezone),
    hour: "numeric",
    minute: "2-digit"
  }).format(toDate(value));
}

/** "Mon, Jun 9 · 9:00 AM MT" */
export function formatDateTimeWithZone(value: string | Date, timezone?: string | null): string {
  const label = zoneLabel(timezone);
  const base = `${formatDateShort(value, timezone)} · ${formatTime(value, timezone)}`;
  return label ? `${base} ${label}` : base;
}

/** "Monday, June 9 · 9:00 AM MT" — for confirmations / detail views. */
export function formatDateTimeLongWithZone(value: string | Date, timezone?: string | null): string {
  const datePart = new Intl.DateTimeFormat("en-US", {
    timeZone: tz(timezone),
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(toDate(value));
  const label = zoneLabel(timezone);
  const base = `${datePart} · ${formatTime(value, timezone)}`;
  return label ? `${base} ${label}` : base;
}

/** "9:00 AM – 10:00 AM MT" given start and end (same zone). */
export function formatTimeRange(start: string | Date, end?: string | Date | null, timezone?: string | null): string {
  const startStr = formatTime(start, timezone);
  if (!end) return startStr;
  const label = zoneLabel(timezone);
  return `${startStr} – ${formatTime(end, timezone)}${label ? ` ${label}` : ""}`;
}

/** Relative day label in the given zone: "Today", "Tomorrow", "Yesterday", or "Mon, Jun 9". */
export function formatRelativeDay(value: string | Date, timezone?: string | null): string {
  const zone = tz(timezone);
  const dayKey = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
    const map: Record<string, string> = {};
    for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
    return Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day));
  };
  const diffDays = Math.round((dayKey(toDate(value)) - dayKey(new Date())) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  return formatDateShort(value, timezone);
}

/** Convert an ISO string or Date to a datetime-local input value (local time). */
export function toDateTimeLocal(value: string | Date): string {
  const d = toDate(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Build a datetime-local value for a given date at a specific hour (default 9am). */
export function dateAtHour(date: Date, hour = 9, minute = 0): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hour)}:${pad(minute)}`;
}

/**
 * Split an instant into its Mountain-time calendar date ("YYYY-MM-DD") and
 * 24-hour time ("HH:MM") — for prefilling separate date + time inputs so what
 * the user edits matches what they see, regardless of their computer's zone.
 */
export function toMountainDateTimeParts(value: string | Date): { date: string; time: string } {
  const d = toDate(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(d);
  const m: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") m[p.type] = p.value;
  const hour = m.hour === "24" ? "00" : m.hour;
  return { date: `${m.year}-${m.month}-${m.day}`, time: `${hour}:${m.minute}` };
}

/**
 * Interpret a date ("YYYY-MM-DD") + time ("HH:MM") entered as Mountain wall-clock
 * and return the absolute UTC instant as an ISO string. So 9:30 AM is stored as
 * 9:30 AM Mountain no matter where the code runs (browser zone or UTC server).
 * Returns null if the inputs don't parse.
 */
export function mountainWallClockToIso(date: string, time: string): string | null {
  const dm = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec((date ?? "").trim());
  if (!dm) return null;
  const tm = /^(\d{1,2}):(\d{2})$/.exec((time || "09:00").trim());
  if (!tm) return null;
  const utc = zonedWallClockToUtc(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2]), DEFAULT_TIMEZONE);
  return utc.toISOString();
}
