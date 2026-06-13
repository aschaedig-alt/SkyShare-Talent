// Compliments by SkyShare — small display helpers.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** "Just now", "5 min ago", "2h ago", "3d ago", or a short date for older items. */
export function relativeTime(date: Date | string, now: Date = new Date()): string {
  const then = typeof date === "string" ? new Date(date) : date;
  const diff = now.getTime() - then.getTime();

  if (diff < MINUTE) return "Just now";
  if (diff < HOUR) {
    const m = Math.floor(diff / MINUTE);
    return `${m} min ago`;
  }
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    return `${h}h ago`;
  }
  if (diff < WEEK) {
    const d = Math.floor(diff / DAY);
    return `${d}d ago`;
  }
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Initials from a full name, e.g. "Sarah Johnson" → "SJ". */
export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}
