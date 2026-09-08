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
 * The ladder, smallest rung to largest, GIVEN BY HIM on 2026-09-08 verbatim:
 *
 *   PC-12 = PC-12 NG = PC-12 NGX → CJ = M2 = CJ2 = CJ3+ → Phenom 100 →
 *   Phenom 300 → 560XL = 560XLS = 560XLS+ → Praetor 600 → Challenger 350 →
 *   G200 → G450/GV → Legacy 650
 *
 * IT IS A PROGRESSION ORDER, NOT A SIZE ORDER, and the difference matters before
 * anybody "corrects" it: a Phenom 100 sits above the CJ family here, which is not
 * what a spec sheet would say. This is the order the company promotes through, so
 * it is the order that decides whether a move was an upgrade. Do not reorder it
 * from aircraft dimensions — ask him.
 *
 * The "=" groups share a rung, so a move between them is a lateral: PC-12 to
 * PC-12 NGX is not an upgrade, and neither is CJ2 to M2.
 *
 * Legacy 650 is the TOP rung, above G450/GV — also his. There is no Legacy 600 in this fleet
 * at all - he confirmed 2026-09-08 that a 600 on a record is an error - so both
 * spellings resolve to the 650 code and share this top rung.
 */
export const SKYSHARE_LADDER = [
  "PC-12",
  "CJ/CJ2/M2",
  "Phenom 100",
  "Phenom 300",
  "560XL",
  "Praetor 600",
  "Challenger 350",
  "G200",
  "G450/GV",
  "Legacy 650"
] as const;

/**
 * Position on the ladder, or -1 for anything not on it.
 *
 * Takes the canonical codes airframeOf produces (see lib/data/employee-journey.ts),
 * so the equivalence groups above collapse here: every PC-12 variant resolves to
 * "PC-12" upstream, and the XLS variants to "560XLS+".
 */
export function ladderRank(aircraft: string | null): number {
  switch (aircraft) {
    case "PC-12":
      return 0;
    // One rung: "CJ = M2 = CJ2 = CJ3+".
    case "CJ":
    case "CJ1":
    case "CJ2":
    case "CJ3":
    case "M2":
      return 1;
    case "Phenom 100":
      return 2;
    case "Phenom 300":
      return 3;
    // One rung: "560XL = 560XLS = 560XLS+".
    case "560XL":
    case "560XLS+":
      return 4;
    case "Praetor 600":
      return 5;
    case "Challenger 350":
      return 6;
    case "G200":
      return 7;
    // One type rating covers both, so they share a rung.
    case "G450":
    case "GV":
      return 8;
    case "Legacy 650":
      return 9;
    default:
      // Off the ladder. Every aircraft code appearing on a real step is now
      // ranked, so this branch is for something new arriving before anybody places
      // it: no size verdict is possible, so a move involving one is a transition
      // and never an upgrade. That is the "almost" in his second rule.
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
 * transition instead. A same-seat lateral, a move WITHIN a rung, or a step down the
 * ladder is not an upgrade; it stays a transition by virtue of the aircraft having
 * changed.
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
  return pr >= 0 && cr >= 0 && cr > pr; // a higher rung, seat not lowered
}
