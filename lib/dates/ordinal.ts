// Ordinal day-of-month, written the way a person writes a date.
//
// Shared because the SAME date has to read identically in the calendar invite
// title and in the orientation email body — "Tuesday, August 4th" in one and
// "Tuesday, August 4" in the other is exactly the kind of drift the
// propagate-a-change rule exists to prevent. Intl.DateTimeFormat has no ordinal
// option, so this is hand-rolled and lives in one place.

/** 1st, 2nd, 3rd, 4th … with the 11th/12th/13th exceptions. */
export function ordinal(day: number): string {
  const rem100 = day % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

/**
 * "Tuesday, August 4th" — always read in the given zone (Mountain for SkyShare),
 * so a late-evening UTC instant can't roll the date forward a day.
 */
export function ordinalDayLabel(iso: string, timeZone = "America/Denver"): string {
  const d = new Date(iso);
  const part = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { timeZone, ...opts }).format(d);
  return `${part({ weekday: "long" })}, ${part({ month: "long" })} ${ordinal(Number(part({ day: "numeric" })))}`;
}
