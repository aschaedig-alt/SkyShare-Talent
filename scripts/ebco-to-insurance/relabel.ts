/**
 * Rename the EBCO step to Insurance on the hires who already have it.
 *
 * The code label changed in lib/onboarding/tasks.ts, but OnboardingTask
 * DENORMALISES label onto every row — so without this the new name appears only
 * on hires created from now on, and 206 existing people keep saying EBCO.
 *
 * Approved 2026-09-11: "Whether to rename EBCO to insurance: yes, rename that to
 * insurance."
 *
 * THE KEY IS NOT TOUCHED. ebco_form stays, because the sheet importer aliases,
 * the task-email config and 206 rows all key off it. Only the human-readable
 * label moves.
 *
 *   npx tsx scripts/ebco-to-insurance/relabel.ts           dry run
 *   npx tsx scripts/ebco-to-insurance/relabel.ts --apply   do it
 *   npx tsx scripts/ebco-to-insurance/relabel.ts --undo     put the old label back
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../prisma/generated/client/client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const HERE = join(process.cwd(), "scripts", "ebco-to-insurance");
const UNDO = join(HERE, "UNDO.json");
const KEY = "ebco_form";
const NEW_LABEL = "Confirm Insurance form on file (request if missing)";

async function main() {
  if (!existsSync(HERE)) mkdirSync(HERE, { recursive: true });
  const apply = process.argv.includes("--apply");
  const undo = process.argv.includes("--undo");

  if (undo) {
    if (!existsSync(UNDO)) throw new Error("No UNDO.json — nothing was applied from here.");
    const saved = JSON.parse(readFileSync(UNDO, "utf8")) as Array<{ label: string; ids: string[] }>;
    let n = 0;
    for (const group of saved) {
      const res = await prisma.onboardingTask.updateMany({ where: { id: { in: group.ids } }, data: { label: group.label } });
      n += res.count;
    }
    console.log(`Restored ${n} rows to their previous labels.`);
    await prisma.$disconnect();
    return;
  }

  // Whole scope, grouped by the label actually stored — so a row somebody already
  // renamed by hand is visible rather than silently overwritten.
  const spread = await prisma.onboardingTask.groupBy({ by: ["label"], where: { key: KEY }, _count: { _all: true } });
  console.log(`Every label stored on key ${KEY}:`);
  for (const r of spread) console.log(`  ${String(r._count._all).padStart(4)}  "${r.label}"`);

  const stale = spread.filter((r) => r.label !== NEW_LABEL);
  const already = spread.find((r) => r.label === NEW_LABEL)?._count._all ?? 0;
  const toChange = stale.reduce((s, r) => s + r._count._all, 0);
  console.log(`\nAlready correct: ${already}`);
  console.log(`Would relabel:   ${toChange}  ->  "${NEW_LABEL}"`);

  if (toChange === 0) { console.log("\nNothing to do."); await prisma.$disconnect(); return; }
  if (!apply) { console.log("\nDry run. Nothing written. Re-run with --apply."); await prisma.$disconnect(); return; }

  // Record the previous label per row, grouped, so a hand-edited one comes back
  // as itself rather than as whatever the majority said.
  const record: Array<{ label: string; ids: string[] }> = [];
  for (const r of stale) {
    const rows = await prisma.onboardingTask.findMany({ where: { key: KEY, label: r.label }, select: { id: true } });
    record.push({ label: r.label, ids: rows.map((x) => x.id) });
  }
  writeFileSync(UNDO, JSON.stringify(record, null, 2));

  const res = await prisma.onboardingTask.updateMany({ where: { key: KEY, label: { not: NEW_LABEL } }, data: { label: NEW_LABEL } });
  const after = await prisma.onboardingTask.groupBy({ by: ["label"], where: { key: KEY }, _count: { _all: true } });
  console.log(`\nApplied. ${res.count} rows relabelled.`);
  for (const r of after) console.log(`  ${String(r._count._all).padStart(4)}  "${r.label}"`);
  console.log(`Undo: ${UNDO}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(String(e));
  await prisma.$disconnect();
  process.exit(1);
});
