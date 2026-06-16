/**
 * Timezone helpers for the booking slot engine.
 *
 * Availability is authored in each host's local time, but slots must be emitted
 * as absolute UTC instants (the invitee's browser renders them in their own zone).
 * We avoid a date library by using Intl.DateTimeFormat to read a zone's offset.
 */

/** Offset of `timeZone` from UTC at the given instant, in milliseconds. */
export function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  let hour = Number(map.hour);
  if (hour === 24) hour = 0; // some runtimes report midnight as 24
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second)
  );
  return asUTC - date.getTime();
}

/**
 * Convert a wall-clock time in `timeZone` to the absolute UTC instant.
 * `month` is 0-based. Refines once to stay correct across DST transitions.
 */
export function zonedWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const utcGuess = Date.UTC(year, month, day, hour, minute, 0);
  const offset1 = tzOffsetMs(new Date(utcGuess), timeZone);
  let ms = utcGuess - offset1;
  const offset2 = tzOffsetMs(new Date(ms), timeZone);
  if (offset2 !== offset1) ms = utcGuess - offset2;
  return new Date(ms);
}

/** Calendar Y/M/D (month 0-based) of an instant as seen in `timeZone`. */
export function tzDateParts(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return { year: Number(map.year), month: Number(map.month) - 1, day: Number(map.day) };
}

/** "YYYY-MM-DD" from 0-based month parts. */
export function isoDate(year: number, month: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}
