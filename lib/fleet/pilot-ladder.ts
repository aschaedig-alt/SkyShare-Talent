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
 * Canonical airframe code from a title (+ an optional aircraft field), so "same
 * aircraft" can be compared and a rung can be looked up.
 *
 * MOVED HERE FROM lib/data/employee-journey.ts on 2026-09-08, for the same
 * reason the ladder itself moved: the client needs it too. The staffing panel
 * has to line the crew roster's group names ("G450 / GV", "Citation CJ3+") up
 * with the ladder, and employee-journey imports Prisma. It is re-exported from
 * there so existing importers still resolve.
 *
 * ORDER IS LOAD-BEARING throughout — see the notes on the CJ family below.
 */
export function airframeOf(title: string, aircraft: string | null): string | null {
  const t = `${title} ${aircraft ?? ""}`;
  const AF: [RegExp, string][] = [
    // CHALLENGER 350 AND PRAETOR 600 WERE MISSING, found 2026-09-08 by a chief-pilot
    // review of this report. Both went into the fleet registry on Aug 28 and neither
    // was ever added here, so airframeOf returned null for their crews - which does
    // not merely mislabel them, it makes their moves invisible: classifyStep needs
    // BOTH sides non-null to call a transition, so a move onto or off these types
    // fell through to "lateral", and a lateral is not counted as a move anywhere.
    // Those pilots sat in "Stayed put" no matter how far they had actually moved.
    // The Challenger 350's type rating is CL-30 (confirmed by him Aug 28), so the
    // pattern accepts either spelling.
    // THE MODEL NUMBER IS REQUIRED, and a bare "Challenger" deliberately does NOT
    // match. It briefly did, on the reasoning that the only Challenger rows on file
    // read "Challenger Pilot" with no model — but he confirmed 2026-09-08 that the
    // Challenger 350 and Praetor 600 are NEW aircraft, which makes those two rows a
    // DIFFERENT and much older Challenger. Matching them would have put pilots on a
    // type that did not exist when they flew. Both of those records are terminated
    // and he has said to disregard them.
    //
    // So this pattern is here for the crews yet to be assigned to the new tails,
    // and it wants the model: 350, or the CL-30 type rating (his confirmation,
    // Aug 28).
    [/\bchallenger ?350\b|\bcl-?30\b/i, "Challenger 350"],
    [/\bpraetor ?600\b/i, "Praetor 600"],
    [/\bg450\b/i, "G450"],
    [/\bg200\b/i, "G200"],
    [/\bgv\b/i, "GV"],
    // THERE IS NO LEGACY 600 IN THIS FLEET. His words, 2026-09-08: "the Legacy is a
    // 650. no 600. would have been an error." So a record saying 600 is a typo for
    // the 650, and both spellings resolve to the same code — rather than the 600
    // sitting off the ladder and quietly turning real moves into laterals, which is
    // what it was doing on 2 steps.
    //
    // THE UNDERLYING ROWS ARE STILL WRONG and want correcting at source. Three of
    // them, all on terminated pilots: Ty Gunnlaugsson and Rick Albin, both "Legacy
    // 600 Pilot", and Mark Killpack, "Legacy 600 Captain" with aircraft "Legacy
    // 600". Mapping here fixes the report, not the data.
    [/\blegacy ?6[05]0\b/i, "Legacy 650"],
    [/\bpc-?12\b/i, "PC-12"],
    [/\bphenom ?300\b/i, "Phenom 300"],
    [/\bphenom ?100\b/i, "Phenom 100"],
    [/\b560 ?xls\+?\b|\bxls\+?\b/i, "560XLS+"],
    [/\b560 ?xl\b|\bxl\b/i, "560XL"],
    // THE CJ FAMILY, all one rung on his ladder ("CJ = M2 = CJ2 = CJ3+") but kept
    // as distinct codes here, because the transition-paths chart should still show
    // a CJ2 → CJ3+ move as the type change it is: a different type rating and a
    // real training event, even though it is not an upgrade.
    //
    // CJ3+ IS IN LIVE USE — Erik Schwerman is on file as a "CJ3+ Captain". Before
    // this it resolved to nothing, so his aircraft could not be identified and his
    // moves could not be classified at all. Ordered longest-first so CJ3+ is not
    // eaten by a looser CJ pattern.
    [/\bcj ?3\+?\b/i, "CJ3"],
    [/\bcj ?2\b|\bce-?525\b/i, "CJ2"],
    [/\bcj ?1\b/i, "CJ1"],
    // A BARE "CJ" counts too — asked for 2026-09-08, "add CJ before the CJ2 and =
    // to it" — so it shares the rung with CJ1 / CJ2 / CJ3+ / M2. LAST of the CJ
    // patterns deliberately: put it first and it would swallow every CJ2 and CJ3+
    // before either was tested, collapsing three distinct type ratings into one and
    // erasing the type changes between them from the paths chart.
    [/\bcj\b/i, "CJ"],
    [/\bm2\b/i, "M2"]
  ];
  for (const [re, code] of AF) if (re.test(t)) return code;
  return null;
}

/**
 * The realistic next moves from a rung, NOT every rung above it.
 *
 * The old version suggested every higher rung, which was fine when the ladder had
 * five rungs and absurd once it had ten: a PC-12 First Officer was handed nine
 * "possible next steps" ending at the Legacy 650, and a list that long says
 * nothing about what happens next.
 *
 * Two limits, both real rather than cosmetic:
 *  - `available` is the set of airframe codes the fleet actually crews in the
 *    pool being looked at. A fractional pilot is not going to be moved onto a
 *    single managed tail, so suggesting one is noise — and, worse, it makes a
 *    G450 captain look like he has somewhere to go when he is at the top of the
 *    shared fleet. Pass an empty set to mean "no filter".
 *  - `limit` caps how far ahead to look. Two rungs is a career conversation;
 *    nine is a list of aircraft.
 */
export function nextRungs(rank: number, available: ReadonlySet<string>, limit = 2): string[] {
  if (rank < 0) return [];
  const out: string[] = [];
  for (let r = rank + 1; r < SKYSHARE_LADDER.length && out.length < limit; r++) {
    const rung = SKYSHARE_LADDER[r];
    if (available.size === 0 || rungIsAvailable(r, available)) out.push(rung);
  }
  return out;
}

/** Does the fleet crew anything on this rung? A rung is a group of codes. */
function rungIsAvailable(rank: number, available: ReadonlySet<string>): boolean {
  for (const code of available) if (ladderRank(code) === rank) return true;
  return false;
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
