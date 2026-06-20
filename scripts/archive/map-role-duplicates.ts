/**
 * One-off inventory: map duplicate / variant Pilot Requirement roles so we can
 * plan the SkyShare-vs-Managed consolidation. READ-ONLY — no writes.
 *
 *   npx tsx scripts/map-role-duplicates.ts
 *
 * Groups every requirement by operatorType + canonical fleet position (resolved
 * from the title / stored slug / aircraft tag) and prints, per group, how many
 * rows collapse into it and what differs (base, pay, status, gate count,
 * linked applications) so we can decide what merges and what stays separate.
 */
import { prisma } from "../../lib/prisma";
import { positionFor, resolveFleetPosition } from "../../lib/fleet/positions";

function parseStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function fmtBase(city: string | null, state: string | null, airport: string | null): string {
  const parts = [city, state].filter(Boolean).join(", ");
  return [parts, airport].filter(Boolean).join(" · ") || "—";
}

async function main() {
  const rows = await prisma.pilotRequirement.findMany({
    where: { NOT: { sourceJobRecord: { mergedIntoJobId: { not: null } } } },
    include: {
      _count: { select: { gates: true, applications: true } },
      sourceJobRecord: { select: { title: true, status: true } }
    }
  });

  type Row = (typeof rows)[number];
  const groups = new Map<string, { operator: string; position: string; rows: Row[] }>();

  for (const r of rows) {
    const aircraftTag = parseStringArray(r.aircraftTypesJson)[0] ?? null;
    const fleet =
      positionFor(r.fleetPositionSlug, r.title) ??
      resolveFleetPosition(r.advertisedTitle) ??
      resolveFleetPosition(aircraftTag);
    const positionLabel = fleet ? fleet.title : `UNRESOLVED: ${r.title}`;
    const operator = (r.operatorType ?? "(unset)").trim() || "(unset)";
    const key = `${operator}||${positionLabel}`;
    const g = groups.get(key) ?? { operator, position: positionLabel, rows: [] };
    g.rows.push(r);
    groups.set(key, g);
  }

  const sorted = [...groups.values()].sort(
    (a, b) => b.rows.length - a.rows.length || a.operator.localeCompare(b.operator) || a.position.localeCompare(b.position)
  );

  const dupGroups = sorted.filter((g) => g.rows.length > 1);
  const singles = sorted.filter((g) => g.rows.length === 1);

  console.log(`\n=== ROLE DUPLICATE MAP ===`);
  console.log(`Total active requirement rows: ${rows.length}`);
  console.log(`Distinct (operator + position) groups: ${sorted.length}`);
  console.log(`Groups with duplicates (2+ rows): ${dupGroups.length}`);
  console.log(`Rows that would collapse away: ${dupGroups.reduce((n, g) => n + g.rows.length - 1, 0)}`);

  console.log(`\n--- DUPLICATE GROUPS (candidates to merge) ---`);
  for (const g of dupGroups) {
    console.log(`\n[${g.operator}] ${g.position}  ×${g.rows.length}`);
    for (const r of g.rows) {
      console.log(
        `   • ${r.title}` +
          ` | seat=${r.pilotSeat ?? "—"}` +
          ` | status=${r.status}/${r.reviewStatus}` +
          ` | base=${fmtBase(r.baseCity, r.baseState, r.baseAirport)}` +
          ` | pay=${(r.payScaleRaw ?? "—").toString().slice(0, 40)}` +
          ` | gates=${r._count.gates} apps=${r._count.applications}` +
          ` | updated=${r.updatedAt.toISOString().slice(0, 10)}` +
          ` | slug=${r.fleetPositionSlug ?? "—"}` +
          ` | id=${r.id.slice(0, 8)}`
      );
    }
  }

  console.log(`\n--- SINGLE-ROW GROUPS (no duplicate) ---`);
  for (const g of singles) {
    console.log(`   [${g.operator}] ${g.position}  (id=${g.rows[0].id.slice(0, 8)}, apps=${g.rows[0]._count.applications})`);
  }

  // Operator breakdown
  const byOperator = new Map<string, number>();
  for (const r of rows) {
    const op = (r.operatorType ?? "(unset)").trim() || "(unset)";
    byOperator.set(op, (byOperator.get(op) ?? 0) + 1);
  }
  console.log(`\n--- BY OPERATOR TYPE ---`);
  for (const [op, n] of [...byOperator.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${op}: ${n}`);
  }

  // Cross-operator: same canonical position appearing under >1 operatorType.
  console.log(`\n--- SAME POSITION ACROSS OPERATOR TYPES (merge/split decisions) ---`);
  const byPosition = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const aircraftTag = parseStringArray(r.aircraftTypesJson)[0] ?? null;
    const fleet = positionFor(r.fleetPositionSlug, r.title) ?? resolveFleetPosition(r.advertisedTitle) ?? resolveFleetPosition(aircraftTag);
    const pos = fleet ? fleet.title : `UNRESOLVED: ${r.title}`;
    const op = (r.operatorType ?? "(unset)").trim() || "(unset)";
    const m = byPosition.get(pos) ?? new Map<string, number>();
    m.set(op, (m.get(op) ?? 0) + 1);
    byPosition.set(pos, m);
  }
  for (const [pos, m] of [...byPosition.entries()].sort()) {
    if (m.size > 1) {
      const parts = [...m.entries()].map(([op, n]) => `${op}×${n}`).join(", ");
      console.log(`   ${pos}: ${parts}`);
    }
  }

  // ---- Pilot JOBS inventory (the imported-jobs side, where variants pile up) ----
  const jobs = await prisma.job.findMany({
    where: { isPilotRole: true, mergedIntoJobId: null },
    select: {
      id: true,
      title: true,
      city: true,
      state: true,
      department: true,
      status: true,
      isOldRole: true,
      pilotSeat: true,
      aircraftTypesJson: true,
      baseLocation: true,
      paySummary: true,
      _count: { select: { applications: true, pilotRequirements: true } }
    }
  });

  const jobGroups = new Map<string, typeof jobs>();
  for (const j of jobs) {
    const aircraftTag = parseStringArray(j.aircraftTypesJson)[0] ?? null;
    const fleet = resolveFleetPosition(j.title) ?? resolveFleetPosition(aircraftTag);
    const pos = fleet ? fleet.title : `UNRESOLVED: ${j.title}`;
    const g = jobGroups.get(pos) ?? [];
    g.push(j);
    jobGroups.set(pos, g);
  }
  const jobSorted = [...jobGroups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

  console.log(`\n\n=== PILOT JOBS INVENTORY (Job table, isPilotRole, not merged) ===`);
  console.log(`Total pilot job rows: ${jobs.length}`);
  console.log(`Distinct canonical positions: ${jobSorted.length}`);
  console.log(`Positions with 2+ job rows (variants): ${jobSorted.filter(([, g]) => g.length > 1).length}`);

  console.log(`\n--- JOB VARIANTS BY POSITION ---`);
  for (const [pos, g] of jobSorted) {
    console.log(`\n${pos}  ×${g.length}`);
    for (const j of g) {
      const loc = [j.city, j.state].filter(Boolean).join(", ") || j.baseLocation || "—";
      console.log(
        `   • ${j.title}` +
          ` | ${loc}` +
          ` | dept=${j.department ?? "—"}` +
          ` | status=${j.status}${j.isOldRole ? " (OLD)" : ""}` +
          ` | seat=${j.pilotSeat ?? "—"}` +
          ` | pay=${(j.paySummary ?? "—").toString().slice(0, 28)}` +
          ` | apps=${j._count.applications} reqs=${j._count.pilotRequirements}` +
          ` | id=${j.id.slice(0, 8)}`
      );
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
