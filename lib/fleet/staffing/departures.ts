// Departure dating for the crew chart: what a noticed departure READS as, and
// who has actually gone but is still an active employee.
//
// PURE module (no Prisma, no server-only imports) so the client chart can use it
// directly — same rule as labels.ts and positions.ts.
//
// TWO DATES, AND THEY ARE NOT INTERCHANGEABLE. `Departure.noticeDate` is the day
// somebody said they were leaving; `Departure.date` is their LAST day and is the
// only one that ages a row out of the default view (labels.ts,
// DEPARTURE_ARCHIVE_DAYS). Everything here keeps them apart on purpose.

import type { CrewGroup, Departure } from "./types";
import { aircraftLabel } from "./labels";

/** yyyy-mm-dd as the chart writes dates elsewhere: "2026-09-25" -> "09/25". */
export function shortDate(iso: string | undefined | null): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return `${iso.slice(5, 7)}/${iso.slice(8, 10)}`;
}

/**
 * The dating half of a departure's note — "notice 09/11 · last day 09/25".
 *
 * Null when the row carries neither date, so a legacy departure whose only
 * dating is free text in `reason` ("departed 06/05") is left exactly as it
 * reads today rather than gaining an empty prefix.
 */
export function departureDateNote(dep: Departure): string | null {
  const notice = shortDate(dep.noticeDate);
  const last = shortDate(dep.date);
  if (notice && last) return `notice ${notice} · last day ${last}`;
  if (notice) return `notice ${notice} · last day not set`;
  if (last) return `last day ${last}`;
  return null;
}

export type PastLastDay = {
  name: string;
  gIdx: number;
  /** Index inside that group's out[] — how the row is addressed for an edit. */
  outIdx: number;
  /** Their last day, yyyy-mm-dd. Always a real date; see the filter below. */
  lastDay: string;
  /** The day notice was given, when the departure was recorded that way. */
  noticeDate?: string;
  /** "PC-12 (N418T)" — what the card is called. */
  aircraft: string;
};

/**
 * Departures whose LAST DAY has passed.
 *
 * Feeds a prompt, never an action. The house pattern is already set by the
 * finished-training banner: a date passing is a reason to ASK, never a reason to
 * act — and here the action on the other side ends somebody's employment on a
 * shared live database, closing their open role and employment stint. So this
 * only ever produces a list to show.
 *
 * TWO DELIBERATE NARROWINGS, both to stop it nagging about the existing backlog:
 *
 *  1. It reads `dep.date` DIRECTLY and does not use departureDate() from
 *     labels.ts. That helper falls back to parsing free text ("departed 06/05"),
 *     which is right for archiving an old row and wrong here — it would turn
 *     every legacy departure on the chart into a prompt to terminate somebody.
 *     An explicit `date` is the marker that a person typed a real last day.
 *  2. Strictly BEFORE today, not on or before. Somebody whose last day is today
 *     has not left yet, and a prompt that fires a day early is how a prompt
 *     earns a reputation for being wrong. Matches completedTraining's rule.
 */
export function departuresPastLastDay(groups: CrewGroup[], today: string | null): PastLastDay[] {
  if (!today) return []; // pre-hydration: no date, no claims
  const out: PastLastDay[] = [];
  groups.forEach((g, gIdx) => {
    (g.out ?? []).forEach((dep, outIdx) => {
      if (!dep.date || !/^\d{4}-\d{2}-\d{2}$/.test(dep.date)) return;
      if (!(dep.date < today)) return;
      out.push({
        name: dep.name,
        gIdx,
        outIdx,
        lastDay: dep.date,
        ...(dep.noticeDate ? { noticeDate: dep.noticeDate } : {}),
        aircraft: aircraftLabel(g)
      });
    });
  });
  return out.sort((a, b) => a.lastDay.localeCompare(b.lastDay) || a.name.localeCompare(b.name));
}
