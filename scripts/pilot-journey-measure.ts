/**
 * READ-ONLY. Measures the Fleet Progression report (Data > Reports > Fleet
 * Progression) against the LIVE database, so a claim about it can be checked
 * rather than believed.
 *
 * It re-implements the client-side aggregation in components/reports/
 * ReportsWorkspace.tsx for the DEFAULT view (active + fractional + any tenure +
 * all years), which is what anybody opening the page actually sees.
 *
 * Prints the WHOLE scope every time, never just the number being questioned:
 * an empty bucket and a broken query look identical from one figure. The pilot
 * inclusion section in particular lists every pilot-titled employee and says
 * which of them the report can and cannot see, because "the report cannot see
 * leavers" is an ABSENCE claim and needs a positive control beside it.
 *
 *   npx tsx scripts/pilot-journey-measure.ts
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { prisma } from "@/lib/prisma";
import { getUpgradeAnalytics, type UpgradePilot } from "@/lib/data/employee-journey";
import { getCrewRoster } from "@/lib/fleet/staffing/roster.server";
import { getFleetStaffing } from "@/lib/data/fleet-staffing";
import { cntSeat, normSeat } from "@/lib/fleet/staffing/compute";

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const v = [...xs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}
function mean(xs: number[]): number | null {
  return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}
const yr = (d: number | null) => (d === null ? "—" : `${(d / 365).toFixed(1)} yr`);

async function main() {
  const { pilots, hasData } = await getUpgradeAnalytics();

  console.log("=== SCOPE ===");
  console.log(`pilots in the dataset:        ${pilots.length}`);
  console.log(`hasData:                      ${hasData}`);
  console.log(`active:                       ${pilots.filter((p) => p.active).length}`);
  console.log(`former (not ACTIVE):          ${pilots.filter((p) => !p.active).length}`);
  console.log(`managed:                      ${pilots.filter((p) => p.managed).length}`);

  // The DEFAULT view: scope=active, pool=fractional, tenure=0, year=all.
  const pool = pilots.filter((p) => p.active && !p.managed);
  const rowsOf = (ps: UpgradePilot[]) =>
    ps.map((p) => {
      let up = 0;
      let tr = 0;
      let mv = 0;
      let capt = 0;
      for (let i = 1; i < p.steps.length; i++) {
        const st = p.steps[i];
        if (st.upgrade) up++;
        if (st.seatUp) capt++;
        if (st.kind === "transition") tr++;
        if (st.upgrade || st.kind === "transition") mv++;
      }
      return { p, up, tr, moves: mv, capt };
    });
  const rows = rowsOf(pool);
  const advanced = rows.filter((r) => r.moves >= 1);
  const tracked = pool.length;

  console.log("\n=== DEFAULT VIEW (active + fractional, all years, any tenure) ===");
  console.log(`tracked:                      ${tracked}`);
  console.log(`advanced (>= 1 move):         ${advanced.length}`);
  console.log(`upgrades total:               ${rows.reduce((a, r) => a + r.up, 0)}`);
  console.log(`transitions total:            ${rows.reduce((a, r) => a + r.tr, 0)}`);
  console.log(`moves total (distinct steps): ${rows.reduce((a, r) => a + r.moves, 0)}`);
  console.log(`made Captain (seat advance):  ${rows.filter((r) => r.capt >= 1).length}`);

  console.log("\n=== WHOLE-FLEET TOTALS (every pilot in the dataset) ===");
  const allRows = rowsOf(pilots);
  console.log(`upgrades:                     ${allRows.reduce((a, r) => a + r.up, 0)}`);
  console.log(`  of which seat advances:     ${pilots.reduce((a, p) => a + p.steps.filter((s) => s.seatUp).length, 0)}`);
  console.log(`transitions:                  ${allRows.reduce((a, r) => a + r.tr, 0)}`);
  console.log(`moves:                        ${allRows.reduce((a, r) => a + r.moves, 0)}`);
  console.log(`made Captain:                 ${allRows.filter((r) => r.capt >= 1).length}`);

  // --- 1a. pct1yr / pct2yr denominator -------------------------------------
  console.log("\n=== BROKEN DENOMINATOR 1: 'Advanced within N yr' ===");
  for (const [label, days] of [["1 yr", 365], ["2 yr", 730]] as const) {
    // THE NUMERATOR MOVES WITH THE DENOMINATOR. A first pass here restricted only
    // the denominator to eligible pilots and left the numerator counting everybody
    // who moved inside the window — including pilots not in the denominator at all
    // — which read 63% for the 2-yr band against the page's 50%. Fixing one half of
    // a ratio is not fixing the ratio.
    const eligible = pool.filter((p) => p.tenureDays >= days);
    const oldNum = advanced.filter((r) => r.p.daysToFirstMove !== null && r.p.daysToFirstMove <= days).length;
    const num = eligible.filter((p) => p.daysToFirstMove !== null && p.daysToFirstMove <= days).length;
    console.log(
      `${label}: OLD ${oldNum}/${tracked} = ${Math.round((oldNum / tracked) * 100)}%` +
        ` | NEW ${num}/${eligible.length} (both restricted to >= ${label} tenure) = ${eligible.length ? Math.round((num / eligible.length) * 100) : 0}%` +
        ` | excluded as too new: ${tracked - eligible.length}`
    );
  }

  // --- 1b. avgToUpgrade / avgToMove drop the never-upgraded ----------------
  console.log("\n=== BROKEN DENOMINATOR 2: 'Avg time to advance' / 'Avg to first upgrade' ===");
  const upDays = pool.map((p) => p.daysToFirstUpgrade).filter((d): d is number => d !== null);
  const mvDays = pool.map((p) => p.daysToFirstMove).filter((d): d is number => d !== null);
  const trDays = pool.map((p) => p.daysToFirstTransition).filter((d): d is number => d !== null);
  console.log(`first UPGRADE:    n=${upDays.length} of ${tracked}  mean ${yr(mean(upDays))}  median ${yr(median(upDays))}  still waiting ${tracked - upDays.length}`);
  console.log(`first MOVE:       n=${mvDays.length} of ${tracked}  mean ${yr(mean(mvDays))}  median ${yr(median(mvDays))}  still waiting ${tracked - mvDays.length}`);
  console.log(`first TRANSITION: n=${trDays.length} of ${tracked}  mean ${yr(mean(trDays))}  median ${yr(median(trDays))}  still waiting ${tracked - trDays.length}`);
  console.log(`median tenure of the still-waiting: ${yr(median(pool.filter((p) => p.daysToFirstUpgrade === null).map((p) => p.tenureDays)))}`);

  // --- 3. the six overlapping tiles ---------------------------------------
  console.log("\n=== OVERLAPPING TILES ===");
  const once = rows.filter((r) => r.moves === 1).length;
  const twicePlus = rows.filter((r) => r.moves >= 2).length;
  const thricePlus = rows.filter((r) => r.moves >= 3).length;
  const exactly2 = rows.filter((r) => r.moves === 2).length;
  console.log(`OLD tiles: Advanced ${advanced.length} | Once ${once} | Twice+ ${twicePlus} | 3x+ ${thricePlus} | Captain ${rows.filter((r) => r.capt >= 1).length} | Stayed ${tracked - advanced.length}`);
  console.log(`           sum of the six = ${advanced.length + once + twicePlus + thricePlus + rows.filter((r) => r.capt >= 1).length + (tracked - advanced.length)} against tracked ${tracked}`);
  console.log(`NEW exclusive buckets: 0 moves ${tracked - advanced.length} | 1 ${once} | 2 ${exactly2} | 3+ ${thricePlus}`);
  console.log(`           sum = ${tracked - advanced.length + once + exactly2 + thricePlus} against tracked ${tracked}`);

  // --- 2. what "Stayed put" is actually made of ---------------------------
  console.log("\n=== WHAT 'STAYED PUT' IS MADE OF ===");
  const { ladderRank, SKYSHARE_LADDER, nextRungs } = await import("@/lib/fleet/pilot-ladder");
  const staffingForCrewed = await getFleetStaffing();
  const crewed = new Set(staffingForCrewed.crewedFractional);
  const stayed = rows.filter((r) => r.moves === 0);
  const lastFlying = (p: UpgradePilot) => {
    for (let i = p.steps.length - 1; i >= 0; i--) if (p.steps[i].aircraft) return p.steps[i];
    return p.steps[p.steps.length - 1] ?? null;
  };
  // Same shape as the report's nextSteps(): an upgrade in place if still SIC,
  // then the next crewed rungs. Kept in step deliberately — a measurement that
  // classifies differently from the page is measuring something else.
  const suggestionsFor = (r: (typeof rows)[number]) => {
    const cur = lastFlying(r.p);
    const rank = ladderRank(cur?.aircraft ?? null);
    if (rank < 0) return 0;
    return (cur?.seat === "SIC" ? 1 : 0) + nextRungs(rank, crewed).length;
  };
  let tooNew = 0;
  let capped = 0;
  let waiting = 0;
  for (const r of stayed) {
    // Capped is tested FIRST, matching the report: a pilot can be both new and
    // out of rungs, and "under a year" expires while "nowhere left to go" does not.
    if (suggestionsFor(r) === 0) capped++;
    else if (r.p.tenureDays < 365) tooNew++;
    else waiting++;
  }
  console.log(`stayed put total:             ${stayed.length}`);
  console.log(`  nowhere left to go:         ${capped}`);
  console.log(`  under a year (not eligible):${tooNew}`);
  console.log(`  eligible and waiting:       ${waiting}`);
  console.log(`  declined a move:            not recorded anywhere — no field captures it`);
  console.log(`  (laterals recorded among them: ${stayed.reduce((a, r) => a + r.p.laterals, 0)})`);
  console.log(`  crewed fractional types feeding the ladder: ${[...crewed].join(", ")}`);

  // --- 8. nextSteps explosion ---------------------------------------------
  console.log("\n=== SUGGESTION COUNT PER STAYED-PUT PILOT ===");
  const oldSuggCounts = stayed.map((r) => {
    const cur = lastFlying(r.p);
    const rank = ladderRank(cur?.aircraft ?? null);
    if (rank < 0) return 0;
    return (cur?.seat === "SIC" ? 1 : 0) + (SKYSHARE_LADDER.length - 1 - rank);
  });
  console.log(`OLD (every rung above, unfiltered): max ${Math.max(0, ...oldSuggCounts)}, distribution ${JSON.stringify(oldSuggCounts.reduce<Record<number, number>>((a, n) => ({ ...a, [n]: (a[n] ?? 0) + 1 }), {}))}`);
  const suggCounts = stayed.map(suggestionsFor);
  console.log(`NEW max suggestions shown for one pilot: ${Math.max(0, ...suggCounts)}`);
  console.log(`distribution: ${JSON.stringify(suggCounts.reduce<Record<number, number>>((a, n) => ({ ...a, [n]: (a[n] ?? 0) + 1 }), {}))}`);

  // --- service stars -------------------------------------------------------
  // The gold asterisks beside a name are tenureYears (rehire-aware anniversary
  // math), NOT tenureDays / 365 (span from the first role). They disagree, and
  // the point of this block is to say by how much rather than to assume.
  console.log("\n=== SERVICE STARS (tenureYears) vs floor(tenureDays / 365) ===");
  const starRows = pool.map((p) => ({ p, stars: p.tenureYears, naive: Math.floor(p.tenureDays / 365) }));
  const disagree = starRows.filter((r) => r.stars !== r.naive);
  console.log(`pilots in the default view:   ${starRows.length}`);
  console.log(`max stars on one pilot:       ${Math.max(0, ...starRows.map((r) => r.stars))}`);
  console.log(`pilots with no stars (< 1 yr):${starRows.filter((r) => r.stars === 0).length}`);
  console.log(`star distribution:            ${JSON.stringify(starRows.reduce<Record<number, number>>((a, r) => ({ ...a, [r.stars]: (a[r.stars] ?? 0) + 1 }), {}))}`);
  console.log(`DISAGREE with the naive count:${disagree.length}`);
  for (const d of disagree) console.log(`    ${d.p.name.padEnd(26)} stars ${d.stars}  naive ${d.naive}  tenureDays ${d.p.tenureDays}`);
  console.log(`fleet-wide max stars:         ${Math.max(0, ...pilots.map((p) => p.tenureYears))}`);

  // --- 6. who the report cannot see ---------------------------------------
  // POSITIVE CONTROL: every pilot-titled employee is listed with a reason, not
  // just the ones that are missing.
  console.log("\n=== PILOT INCLUSION — the positive control for 'the report cannot see leavers' ===");
  const hires = await prisma.newHire.findMany({
    select: {
      id: true,
      name: true,
      position: true,
      department: true,
      employmentStatus: true,
      managedPilot: true,
      startDate: true,
      _count: { select: { roleAssignments: true } }
    }
  });
  const PILOTISH = /\b(pilot|captain|first officer|f\/?o|sic|pic|cpt|instructor)\b/i;
  const inReport = new Set(pilots.map((p) => p.hireId));
  const pilotish = hires.filter((h) => PILOTISH.test(h.position ?? "") || /flight ?op/i.test(h.department ?? ""));
  console.log(`NewHire rows in total:                          ${hires.length}`);
  console.log(`pilot-titled or Flight Ops:                     ${pilotish.length}`);
  console.log(`  of those, VISIBLE in the report:              ${pilotish.filter((h) => inReport.has(h.id)).length}`);
  console.log(`  of those, INVISIBLE:                          ${pilotish.filter((h) => !inReport.has(h.id)).length}`);
  const byStatus = (pred: (h: (typeof hires)[number]) => boolean) => {
    const g: Record<string, number> = {};
    for (const h of pilotish.filter(pred)) g[h.employmentStatus] = (g[h.employmentStatus] ?? 0) + 1;
    return g;
  };
  console.log(`  VISIBLE by employmentStatus:   ${JSON.stringify(byStatus((h) => inReport.has(h.id)))}`);
  console.log(`  INVISIBLE by employmentStatus: ${JSON.stringify(byStatus((h) => !inReport.has(h.id)))}`);
  const invisible = pilotish.filter((h) => !inReport.has(h.id));
  console.log(`\n  every invisible pilot, with the reason:`);
  for (const h of invisible) {
    const why = h._count.roleAssignments === 0 ? (h.startDate ? "NO RoleAssignment rows (never backfilled)" : "NO RoleAssignment rows AND no start date") : "has roles but no role resolved to a seat";
    console.log(`    ${h.employmentStatus.padEnd(11)} ${(h.position ?? "—").slice(0, 42).padEnd(44)} ${h.name.padEnd(26)} ${why}`);
  }

  // --- 5. staffing counts --------------------------------------------------
  console.log("\n=== STAFFING (lib/fleet/staffing — the crew roster the org chart renders) ===");
  const roster = await getCrewRoster();
  let F = 0;
  let T = 0;
  let O = 0;
  let AT = 0;
  console.log(`  ${"group".padEnd(26)} ${"pool".padEnd(10)} seat  filled train open target`);
  for (const g of roster.groups) {
    if (g.noCount) continue;
    for (const [seatName, seat] of [["PIC", g.pic], ["SIC", g.sic]] as const) {
      if (!seat) continue;
      const c = cntSeat(normSeat(seat));
      if (c.at === 0 && c.p === 0) continue;
      F += c.f;
      T += c.tr;
      O += c.o;
      AT += c.at;
      console.log(`  ${g.name.slice(0, 25).padEnd(26)} ${g.pool.padEnd(10)} ${seatName}   ${String(c.f).padStart(6)} ${String(c.tr).padStart(5)} ${String(c.o).padStart(4)} ${String(c.at).padStart(6)}`);
    }
  }
  console.log(`  ${"TOTAL".padEnd(26)} ${"".padEnd(10)}      ${String(F).padStart(6)} ${String(T).padStart(5)} ${String(O).padStart(4)} ${String(AT).padStart(6)}`);
  console.log(`  reconciles: ${F} + ${T} + ${O} = ${F + T + O} against target ${AT}  ${F + T + O === AT ? "OK" : "MISMATCH"}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
