// Naming and dating helpers shared by the fleet org charts.
//
// PURE module (no Prisma, no server-only imports) so the client charts can use
// it directly, same rule as lib/fleet/positions.ts.
//
// Two problems live here:
//
// 1. A MANAGED aircraft is one tail, and the chart names it by TYPE. Six managed
//    PC-12s therefore produce six identical "PC-12 — First Officer" entries in
//    every position list, and a user picking one has no way to tell which tail
//    they picked. This bit them for real: a pilot was moved onto a managed PC-12
//    when a fractional seat was meant. Managed positions carry their tail now;
//    fractional ones deliberately do not, because a fractional group is a whole
//    type (4 aircraft), not a tail.
//
// 2. A departure sits under "Transitioning out" forever, because nothing ever
//    decided it was old news. Departures now carry a real date and age out.

import type { CrewGroup, Departure } from "./types";

/** The tail number out of a group's `sub` ("N418T · Fish Hawk Air" -> "N418T").
    Null when the sub carries no tail (a fractional group's "4 aircraft · SkyShare"). */
export function tailOf(sub: string | null | undefined): string | null {
  if (!sub) return null;
  const first = sub.split("·")[0]?.trim() ?? "";
  // A US registration: N, then digits, then an optional 1-2 letter suffix.
  return /^N\d{1,5}[A-Z]{0,2}$/i.test(first) ? first.toUpperCase() : null;
}

/** The owner/company out of a group's `sub` ("N418T · Fish Hawk Air" -> "Fish Hawk Air"). */
export function ownerOf(sub: string | null | undefined): string | null {
  if (!sub) return null;
  const rest = sub.split("·").slice(1).join("·").trim();
  return rest || null;
}

/**
 * How a position on this aircraft should read in a list: "PC-12 First Officer"
 * for a fractional group, "PC-12 First Officer (N418T)" for a managed tail.
 *
 * The tail goes LAST, in parentheses, because the position is what someone is
 * scanning for and the tail is the disambiguator — sorting or eyeballing a list
 * of "PC-12 ..." entries still groups them together.
 */
export function positionLabel(group: CrewGroup, seatWord: string): string {
  const tail = group.pool === "Managed" ? tailOf(group.sub) : null;
  const base = `${group.name} ${seatWord}`.trim();
  return tail ? `${base} (${tail})` : base;
}

/** An aircraft on its own, same rule: "PC-12" or "PC-12 (N418T)". */
export function aircraftLabel(group: CrewGroup): string {
  const tail = group.pool === "Managed" ? tailOf(group.sub) : null;
  return tail ? `${group.name} (${tail})` : group.name;
}

// --- departure dating -------------------------------------------------------

/** Today as yyyy-mm-dd in LOCAL time. Never call this during render in a client
    component — it differs between the server and the client and will fail
    hydration. Read it in an effect and hold it in state. */
export function isoToday(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * The date a departure actually happened, as yyyy-mm-dd, or null if undated.
 *
 * Prefers the explicit `date` field. Falls back to parsing the free-text reason
 * ("departed 06/15"), which is how EVERY departure on the chart was written
 * before this field existed — without the fallback the whole existing backlog
 * could never age out, which is the thing being fixed.
 *
 * A bare MM/DD has no year, so it resolves to the most recent occurrence that is
 * not in the future. Reading a 2025 departure as this year only ever makes it
 * look NEWER, so a genuinely old row is never held back by the guess.
 */
export function departureDate(dep: Departure, today: string): string | null {
  if (dep.date && /^\d{4}-\d{2}-\d{2}$/.test(dep.date)) return dep.date;

  const text = `${dep.reason ?? ""}`;
  const m = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/.exec(text);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const pad = (n: number) => String(n).padStart(2, "0");
  if (m[3]) {
    const raw = Number(m[3]);
    const year = raw < 100 ? 2000 + raw : raw;
    return `${year}-${pad(month)}-${pad(day)}`;
  }
  const thisYear = Number(today.slice(0, 4));
  const guess = `${thisYear}-${pad(month)}-${pad(day)}`;
  return guess <= today ? guess : `${thisYear - 1}-${pad(month)}-${pad(day)}`;
}

/** Whole days between two yyyy-mm-dd dates (b - a). */
export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** How long a departure has to sit before it stops showing by default. */
export const DEPARTURE_ARCHIVE_DAYS = 30;

/**
 * Should this departure be archived (hidden from the default view)?
 *
 * DERIVED, never written. Nothing has to run, nothing can half-run, and the
 * shared live database is not touched to hide a row — a date passing is the
 * whole mechanism. It also stays reversible: correct the date and the row is
 * back.
 *
 * An UNDATED departure never archives. That is deliberate: a tentative internal
 * move is recorded as a departure with no date and is genuinely still pending,
 * so ageing it out would hide live work.
 */
export function isDepartureArchived(dep: Departure, today: string | null): boolean {
  if (!today) return false; // pre-hydration: show everything, matches the server render
  const on = departureDate(dep, today);
  if (!on) return false;
  return daysBetween(on, today) >= DEPARTURE_ARCHIVE_DAYS;
}

/** Split a group's departures into what still shows and what has aged out. */
export function splitDepartures(out: Departure[] | undefined, today: string | null): { current: Departure[]; archived: Departure[] } {
  const current: Departure[] = [];
  const archived: Departure[] = [];
  for (const dep of out ?? []) (isDepartureArchived(dep, today) ? archived : current).push(dep);
  return { current, archived };
}
