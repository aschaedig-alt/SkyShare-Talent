/**
 * The SkyShare shared-pool aircraft ladder, and the house rules for what counts as
 * an upgrade.
 *
 * A MODULE OF ITS OWN, WITH NO IMPORTS, and that is the whole reason it exists.
 * This lived in lib/data/employee-journey.ts for about ten minutes on 2026-09-08
 * and took the reports page down with a 500: employee-journey imports Prisma,
 * ReportsWorkspace is a "use client" component, and importing a VALUE from it
 * dragged Prisma into the client bundle — "Module not found: Can't resolve 'fs'".
 * It had been safe until then only because the report imported a TYPE, which is
 * erased at compile time. A shared rule that both the server classifier and a
 * client component need has to live somewhere neither drags the other in.
 *
 * THE RULES, his words on 2026-09-08:
 *   "any sic to pic is an upgrade"
 *   "almost any aircraft to a larger aircraft is an upgrade"
 *   "a lateral same seat move is a transistion"
 *   "a seat change (lower) and aircraft change is usually a transition"
 *   and confirming: "same seat moves to a larger aircraft are upgrades"
 */

/**
 * Smallest to largest. Managed aircraft are deliberately absent: he confirmed the
 * same upgrade rules apply to them, but they are rarely used and none has been
 * placed in this order yet — and an ordering invented here would be a guess about
 * which aeroplane is the bigger job.
 *
 * NOT YET PLACED: Challenger 350, Praetor 600 (both new aircraft), and the managed
 * types — Legacy 650, Phenom 100/300, M2, 560XLS+. Until they are ordered, a move
 * onto one is a transition and never a size upgrade.
 */
export const SKYSHARE_LADDER = ["PC-12", "CJ2", "560XL", "G200", "G450/GV"] as const;

/** Position on the ladder, or -1 for anything not on it. */
export function ladderRank(aircraft: string | null): number {
  switch (aircraft) {
    case "PC-12":
      return 0;
    case "CJ2":
      return 1;
    case "560XL":
      return 2;
    case "G200":
      return 3;
    // One type rating covers both, so they share the top rung.
    case "G450":
    case "GV":
      return 4;
    default:
      return -1;
  }
}

/** PIC outranks SIC. null when the seat is not recorded, which is common on older rows. */
export function seatRank(seat: string | null): number | null {
  return seat === "PIC" ? 1 : seat === "SIC" ? 0 : null;
}

/**
 * Is this step an upgrade?
 *
 * A seat advance is always one, whatever the aircraft did. A move up the ladder is
 * one too — UNLESS the seat went down, where his fourth rule wins and the step is a
 * transition instead. A same-seat lateral, or a step down the ladder, is not an
 * upgrade; it stays a transition by virtue of the aircraft having changed.
 *
 * Anything off the ladder cannot be judged larger or smaller, so it yields no size
 * upgrade. That is the "almost" in his second rule, and the honest answer while the
 * managed types and the two new aircraft are unplaced.
 */
export function isUpgradeStep(
  prevSeat: string | null,
  prevAircraft: string | null,
  seat: string | null,
  aircraft: string | null
): boolean {
  const ps = seatRank(prevSeat);
  const cs = seatRank(seat);
  if (ps === 0 && cs === 1) return true; // SIC -> PIC, any aircraft
  if (ps === 1 && cs === 0) return false; // seat lowered — his rule four
  const pr = ladderRank(prevAircraft);
  const cr = ladderRank(aircraft);
  return pr >= 0 && cr >= 0 && cr > pr; // larger aircraft, seat not lowered
}
