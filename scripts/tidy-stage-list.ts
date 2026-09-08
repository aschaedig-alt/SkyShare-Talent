/**
 * Sets the pipeline stage list to the agreed shape, and folds the retired
 * "Prescreen Complete" into Screening.
 *
 * DRY RUN BY DEFAULT:
 *   npx tsx scripts/tidy-stage-list.ts            # review
 *   npx tsx scripts/tidy-stage-list.ts --apply    # do it
 *
 * OPEN is exactly New, Applied, Screening, Interviewing, Offer — the states
 * where somebody is still being worked. Hired moves to CLOSED, because a hired
 * candidate is a finished one; that is a grouping change only and moves nobody.
 *
 * The eight people still carrying "Prescreen Complete" DO get rewritten, to
 * Screening. That is the one real data change here, and it is listed by name
 * below before anything is written.
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { prisma } from "@/lib/prisma";
import { getStageList, saveStageList } from "@/lib/data/candidate-stages";
import type { CandidateStage } from "@/lib/candidates/stages";

const TARGET: CandidateStage[] = [
  { value: "New", group: "Open" },
  { value: "Applied", group: "Open" },
  { value: "Screening", group: "Open" },
  { value: "Interviewing", group: "Open" },
  { value: "Offer", group: "Open" },
  { value: "Hired", group: "Closed" },
  { value: "Saved For Later", group: "Closed" },
  { value: "Withdrew", group: "Closed" },
  { value: "Rejected", group: "Closed" },
  { value: "Knocked Out", group: "Closed" },
  { value: "Archived", group: "Closed" }
];

const RETIRED_TO = new Map([["Prescreen Complete", "Screening"]]);

async function main() {
  const apply = process.argv.includes("--apply");
  const before = await getStageList();

  console.log("STAGE LIST");
  console.log("  before:", before.map((s) => `${s.value} [${s.group}]`).join(", "));
  console.log("  after :", TARGET.map((s) => `${s.value} [${s.group}]`).join(", "));
  const moved = TARGET.filter((t) => {
    const was = before.find((b) => b.value === t.value);
    return was && was.group !== t.group;
  });
  if (moved.length) {
    console.log("  regrouped:", moved.map((m) => `${m.value} -> ${m.group}`).join(", "));
    console.log("  (a grouping change only — nobody's stage is rewritten by it)");
  }

  console.log("\nCANDIDATES ON A RETIRED STAGE");
  const plan: Array<{ id: string; name: string; from: string; to: string }> = [];
  for (const [from, to] of RETIRED_TO) {
    const people = await prisma.candidate.findMany({
      where: { stage: from, status: { not: "MERGED" } },
      select: { id: true, displayName: true, archivedAt: true }
    });
    for (const p of people) {
      plan.push({ id: p.id, name: p.displayName + (p.archivedAt ? "  (archived)" : ""), from, to });
    }
    console.log(`  "${from}" -> "${to}"   ${people.length} candidate${people.length === 1 ? "" : "s"}`);
    for (const p of people) console.log(`      ${p.displayName}${p.archivedAt ? "  (archived)" : ""}`);
  }

  if (!apply) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply.");
    return;
  }

  console.log("\napplying…");
  const saved = await saveStageList(TARGET);
  console.log("  stage list saved:", saved.map((s) => s.value).join(", "));

  for (const p of plan) {
    await prisma.candidate.update({ where: { id: p.id }, data: { stage: p.to } });
    console.log(`  ${p.name}: ${p.from} -> ${p.to}`);
  }

  // Read back rather than trust it.
  console.log("\nverifying:");
  const usage = await prisma.candidate.groupBy({
    by: ["stage"],
    where: { status: { not: "MERGED" } },
    _count: true
  });
  const listed = new Set(TARGET.map((s) => s.value.toLowerCase()));
  for (const u of usage.sort((a, b) => b._count - a._count)) {
    const label = (u.stage ?? "(none)").trim();
    const off = label !== "(none)" && !listed.has(label.toLowerCase()) ? "   <-- not on the list" : "";
    console.log(`   ${String(u._count).padStart(5)}  ${label}${off}`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
