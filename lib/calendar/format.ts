import { timezoneAbbr } from "@/lib/calendar/timezones";

/** "Mon, Jun 9" */
export function formatDateShort(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(d);
}

/** "Monday, June 9, 2026" */
export function formatDateLong(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(d);
}

/** "9:00 AM" */
export function formatTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(d);
}

/** "Mon, Jun 9 · 9:00 AM MT" */
export function formatDateTimeWithZone(value: string | Date, timezone?: string | null): string {
  const abbr = timezoneAbbr(timezone);
  const base = `${formatDateShort(value)} · ${formatTime(value)}`;
  return abbr ? `${base} ${abbr}` : base;
}

/** "9:00 AM – 10:00 AM" given start and end */
export function formatTimeRange(start: string | Date, end?: string | Date | null): string {
  const startStr = formatTime(start);
  if (!end) return startStr;
  return `${startStr} – ${formatTime(end)}`;
}

/** Relative day label: "Today", "Tomorrow", "Yesterday", or "Mon, Jun 9" */
export function formatRelativeDay(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const today = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const diffDays = Math.round(
    (startOfDay(d).getTime() - startOfDay(today).getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  return formatDateShort(d);
}

/** Convert an ISO string or Date to a datetime-local input value (local time). */
export function toDateTimeLocal(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Build a datetime-local value for a given date at a specific hour (default 9am). */
export function dateAtHour(date: Date, hour = 9, minute = 0): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hour)}:${pad(minute)}`;
}
