/**
 * Slot engine — pure, no I/O. Given a host's rules + busy intervals, produce the
 * bookable slots. Data loading lives in lib/data/booking.ts.
 *
 * Rules honored:
 *  - recurring weekly windows (host-local time)
 *  - per-date overrides: BLOCK (vacation/holiday) and CUSTOM (special hours);
 *    org-wide overrides (hostId null) also apply
 *  - booking type duration (30/45/60) + buffer (0 or 10) between bookings
 *  - minimum notice, booking window (e.g. 90 days), optional max-per-day
 */
import { zonedWallClockToUtc, tzDateParts, isoDate } from "./timezone";

export type BusyInterval = { start: Date; end: Date };

export type WeeklyRule = { dayOfWeek: number; startMinute: number; endMinute: number };

export type DateOverride = {
  startDate: Date; // @db.Date → UTC midnight
  endDate: Date;
  kind: string; // BLOCK | CUSTOM
  startMinute: number | null;
  endMinute: number | null;
};

export type HostForSlots = {
  timezone: string;
  minNoticeHours: number;
  bookingWindowDays: number;
  maxPerDay: number | null;
  weeklyRules: WeeklyRule[];
  overrides: DateOverride[];
};

export type SlotQuery = {
  durationMinutes: number;
  bufferMinutes: number; // effective buffer (type override or host default)
  from?: Date | null; // optional clamp (defaults to now)
  to?: Date | null; // optional clamp (defaults to now + window)
};

export type DaySlots = { date: string; slots: string[] }; // date = YYYY-MM-DD (host tz), slots = ISO UTC

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Is the calendar day (UTC-midnight anchor) within an override's inclusive range? */
function dayInOverride(dayUtcMidnight: number, o: DateOverride): boolean {
  return dayUtcMidnight >= o.startDate.getTime() && dayUtcMidnight <= o.endDate.getTime();
}

export function computeSlots(
  host: HostForSlots,
  query: SlotQuery,
  busy: BusyInterval[],
  bookedCountByDate: Map<string, number>,
  now: Date = new Date()
): DaySlots[] {
  const tz = host.timezone;
  const duration = query.durationMinutes;
  const buffer = query.bufferMinutes;
  const step = duration; // non-overlapping back-to-back slots

  const minStart = new Date(now.getTime() + host.minNoticeHours * 3600_000).getTime();
  const windowEnd = new Date(now.getTime() + host.bookingWindowDays * 86_400_000).getTime();

  const rangeStart = query.from && query.from.getTime() > now.getTime() ? query.from : now;
  const rangeEndMs = Math.min(windowEnd, query.to ? query.to.getTime() : windowEnd);
  if (rangeEndMs < rangeStart.getTime()) return [];

  // Pre-expand busy by buffer so a gap is enforced around existing events.
  const bufferedBusy = busy.map((b) => ({
    start: b.start.getTime() - buffer * 60_000,
    end: b.end.getTime() + buffer * 60_000
  }));

  const startParts = tzDateParts(rangeStart, tz);
  const out: DaySlots[] = [];

  // Iterate day-by-day using a noon-UTC anchor (immune to DST shifting the date).
  const maxDays = host.bookingWindowDays + 1;
  for (let i = 0; i < maxDays; i += 1) {
    const anchor = new Date(Date.UTC(startParts.year, startParts.month, startParts.day, 12) + i * 86_400_000);
    const y = anchor.getUTCFullYear();
    const mo = anchor.getUTCMonth();
    const d = anchor.getUTCDate();
    const dow = anchor.getUTCDay();
    const dayUtcMidnight = Date.UTC(y, mo, d);

    // Stop once the day starts after the range end.
    if (zonedWallClockToUtc(y, mo, d, 0, 0, tz).getTime() > rangeEndMs) break;

    // Resolve the day's windows.
    let windows = host.weeklyRules
      .filter((r) => r.dayOfWeek === dow)
      .map((r) => ({ s: r.startMinute, e: r.endMinute }));

    const dayOverrides = host.overrides.filter((o) => dayInOverride(dayUtcMidnight, o));
    if (dayOverrides.some((o) => o.kind === "BLOCK")) {
      windows = [];
    } else {
      const customs = dayOverrides.filter(
        (o) => o.kind === "CUSTOM" && o.startMinute != null && o.endMinute != null
      );
      if (customs.length > 0) {
        windows = customs.map((o) => ({ s: o.startMinute as number, e: o.endMinute as number }));
      }
    }
    if (windows.length === 0) continue;

    const dateStr = isoDate(y, mo, d);
    if (host.maxPerDay != null && (bookedCountByDate.get(dateStr) ?? 0) >= host.maxPerDay) continue;

    const daySlots: string[] = [];
    for (const w of windows) {
      for (let m = w.s; m + duration <= w.e; m += step) {
        const slotStart = zonedWallClockToUtc(y, mo, d, Math.floor(m / 60), m % 60, tz);
        const startMs = slotStart.getTime();
        const endMs = startMs + duration * 60_000;
        if (startMs < minStart || startMs < rangeStart.getTime() || endMs > rangeEndMs) continue;
        const conflict = bufferedBusy.some((b) => overlaps(startMs, endMs, b.start, b.end));
        if (!conflict) daySlots.push(slotStart.toISOString());
      }
    }

    if (daySlots.length > 0) {
      daySlots.sort();
      out.push({ date: dateStr, slots: daySlots });
    }
  }

  return out;
}

/** Validate a single requested start is actually a free slot (used at booking time). */
export function isSlotBookable(
  host: HostForSlots,
  query: SlotQuery,
  busy: BusyInterval[],
  bookedCountByDate: Map<string, number>,
  requestedStart: Date,
  now: Date = new Date()
): boolean {
  const target = requestedStart.toISOString();
  const days = computeSlots(
    host,
    { ...query, from: new Date(requestedStart.getTime() - 60_000), to: new Date(requestedStart.getTime() + query.durationMinutes * 60_000) },
    busy,
    bookedCountByDate,
    now
  );
  return days.some((day) => day.slots.includes(target));
}
