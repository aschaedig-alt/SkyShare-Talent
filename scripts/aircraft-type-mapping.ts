/**
 * READ-ONLY. Runs the aircraft reference over every stored type_ratings value
 * and shows what each person's Types column WOULD say, so the mapping can be
 * checked before it is wired into the page.
 *
 *   npx tsx scripts/aircraft-type-mapping.ts [out.json]
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { writeFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { parseTypeRatings } from "@/lib/candidates/aircraft-types";

async function main() {
  const out = process.argv[2] ?? "aircraft-type-mapping.json";

  const rows = await prisma.candidateMetric.findMany({
    where: { key: "type_ratings", status: { not: "DISMISSED" } },
    select: {
      valueText: true,
      status: true,
      candidate: { select: { displayName: true, archivedAt: true, status: true } }
    }
  });

  const typeCounts = new Map<string, number>();
  const droppedCounts = new Map<string, number>();
  const unknownCounts = new Map<string, number>();
  const perPerson: Array<{
    person: string;
    live: boolean;
    status: string;
    stored: string;
    types: string[];
    dropped: string[];
    unknown: string[];
  }> = [];

  for (const r of rows) {
    if (r.candidate.status === "MERGED") continue;
    const parsed = parseTypeRatings(r.valueText);
    for (const t of parsed.types) typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
    for (const d of parsed.notTypes) droppedCounts.set(d.raw, (droppedCounts.get(d.raw) ?? 0) + 1);
    for (const u of parsed.unknown) unknownCounts.set(u, (unknownCounts.get(u) ?? 0) + 1);
    perPerson.push({
      person: r.candidate.displayName,
      live: !r.candidate.archivedAt,
      status: r.status,
      stored: r.valueText ?? "",
      types: parsed.types,
      dropped: parsed.notTypes.map((d) => d.raw),
      unknown: parsed.unknown
    });
  }

  const totalUnknown = [...unknownCounts.values()].reduce((n, v) => n + v, 0);
  const peopleWithUnknown = perPerson.filter((p) => p.unknown.length).length;
  const peopleWithNoTypes = perPerson.filter((p) => p.types.length === 0).length;

  console.log(`records: ${perPerson.length}`);
  console.log(`distinct canonical types recognised: ${typeCounts.size}`);
  console.log(`values dropped as not-a-type: ${droppedCounts.size} distinct`);
  console.log(`values not recognised: ${unknownCounts.size} distinct (${totalUnknown} occurrences, ${peopleWithUnknown} people)`);
  console.log(`people who end up with NO types at all: ${peopleWithNoTypes}`);

  console.log("\n--- CANONICAL TYPES, most common first ---");
  for (const [t, n] of [...typeCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(n).padStart(4)}  ${t}`);
  }

  console.log("\n--- DROPPED as not a type rating ---");
  for (const [d, n] of [...droppedCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(n).padStart(4)}  ${d}`);
  }

  console.log("\n--- NOT RECOGNISED (kept and shown, not dropped) ---");
  for (const [u, n] of [...unknownCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(n).padStart(4)}  ${JSON.stringify(u)}`);
  }

  console.log("\n--- THE MESSY ONES, before and after ---");
  const messy = perPerson
    .filter((p) => p.stored.includes("/") || p.stored.includes("(") || p.dropped.length)
    .slice(0, 14);
  for (const p of messy) {
    console.log(`\n   ${p.person}${p.live ? "" : "  (archived)"}  [${p.status}]`);
    console.log(`     stored : ${p.stored.slice(0, 110)}`);
    console.log(`     types  : ${p.types.join(" · ") || "(none)"}`);
    if (p.dropped.length) console.log(`     dropped: ${p.dropped.join(" · ")}`);
    if (p.unknown.length) console.log(`     unknown: ${p.unknown.join(" · ")}`);
  }

  writeFileSync(out, JSON.stringify({ perPerson, typeCounts: Object.fromEntries(typeCounts), droppedCounts: Object.fromEntries(droppedCounts), unknownCounts: Object.fromEntries(unknownCounts) }, null, 2));
  console.log(`\nfull mapping written to ${out}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
