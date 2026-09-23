/**
 * One Line Service Technician job, tagged with every base it hires for.
 *
 * His instruction, 2026-09-23: "lets make all of the Line Service Technician jobs
 * one job and it can just have a location tag on it like DVO, SVR, OGD, SLC."
 *
 * WHY. Two technician jobs existed, "| DVO" (Novato, CA) and "| OGD" (Ogden, UT),
 * both 2024 JazzHR records, and 328 Paycom applications named neither - the
 * import kept only the posting title, so nothing said which base they were for,
 * and he could not answer it without the location. One job with the bases on it
 * makes the question disappear rather than guessing an answer to it.
 *
 * WHAT IT DOES
 *   1. Merges "| DVO" into "| OGD" through lib/jobs/merge.ts - the same merge the
 *      duplicate tools use, which writes a JobMergeRecord and has its own undo.
 *   2. Renames the survivor "Line Service Technician", under the same rule the
 *      app's rename route enforces (refused if a LIVE job already has the name -
 *      the old merged-away "Line Service Technician" row does not count), and
 *      puts the bases in its location: "DVO, SVR, OGD, SLC".
 * The Paycom titles are then linked by scripts/paycom-app-job-link.ts, which
 * holds the three technician titles in its ALIASES map.
 *
 * WHY THE BASES GO IN THE CITY FIELD. The jobs list and the job page both show
 * location as city + state, so that is where a tag has to live to be seen, and it
 * stays editable in the same place as any job's location. Two known costs, both
 * small: state is blank, and the title matcher's base check reads this job as
 * Utah (it finds SLC and OGD first), so a future Paycom posting titled "| DVO"
 * would need its own ALIASES line rather than matching on its own.
 *
 *   npx tsx scripts/paycom-lst-merge.ts           what it would do
 *   npx tsx scripts/paycom-lst-merge.ts --apply   do it (writes undo.json first)
 *   npx tsx scripts/paycom-lst-merge.ts --undo    rename back and un-merge DVO
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../lib/prisma";
import { mergeJobs, undoMerge } from "../lib/jobs/merge";

const OUT_DIR = path.join("scripts", "paycom-lst-merge");
const UNDO = path.join(OUT_DIR, "undo.json");

const SURVIVOR_TITLE = "Line Service Technician | OGD";
const MERGE_IN = ["Line Service Technician | DVO"];
const NEW_TITLE = "Line Service Technician";
const BASES = "DVO, SVR, OGD, SLC";
const normalizeTitle = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

type Undo = {
  at: string;
  survivorId: string;
  before: { title: string; normalizedTitle: string | null; city: string | null; state: string | null };
  mergedIds: string[];
};

async function live(title: string) {
  return prisma.job.findFirst({
    where: { title, mergedIntoJobId: null, status: { not: "MERGED" } },
    select: { id: true, title: true, normalizedTitle: true, city: true, state: true, status: true, _count: { select: { applications: true } } }
  });
}

async function undo() {
  if (!existsSync(UNDO)) throw new Error("No undo.json - nothing was applied from here.");
  const u = JSON.parse(readFileSync(UNDO, "utf8")) as Undo;
  await prisma.job.update({ where: { id: u.survivorId }, data: u.before });
  for (const id of u.mergedIds) {
    const res = await undoMerge(id);
    console.log(`${res.success ? "Un-merged" : "Could NOT un-merge"} ${id}: ${res.message}`);
  }
  writeFileSync(UNDO, JSON.stringify(null));
  console.log(`Survivor renamed back to "${u.before.title}" with its old location.`);
}

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  if (process.argv.includes("--undo")) return undo();
  const apply = process.argv.includes("--apply");

  const survivor = await live(SURVIVOR_TITLE);
  if (!survivor) throw new Error(`No live job called "${SURVIVOR_TITLE}".`);
  const others = [];
  for (const t of MERGE_IN) {
    const j = await live(t);
    if (!j) console.log(`SKIP  "${t}" - no live job by that name (already merged?).`);
    else others.push(j);
  }
  // The rename route's own rule: never rename onto a name another LIVE job holds.
  const clash = await prisma.job.findFirst({
    where: { normalizedTitle: normalizeTitle(NEW_TITLE), mergedIntoJobId: null, id: { notIn: [survivor.id, ...others.map((o) => o.id)] } },
    select: { id: true, title: true, status: true }
  });
  if (clash) throw new Error(`"${clash.title}" (${clash.status}) already uses the name - merge it in instead.`);

  console.log(`Survivor: ${survivor.title} (${survivor.status}, ${survivor._count.applications} applications, ${survivor.city ?? "-"}, ${survivor.state ?? "-"})`);
  for (const o of others) console.log(`Merge in: ${o.title} (${o.status}, ${o._count.applications} applications, ${o.city ?? "-"}, ${o.state ?? "-"})`);
  console.log(`Then:     rename to "${NEW_TITLE}", location "${BASES}"`);

  if (!apply) {
    console.log("\nDRY RUN - nothing changed. Pass --apply.");
    return;
  }

  const record: Undo = {
    at: new Date().toISOString(),
    survivorId: survivor.id,
    before: { title: survivor.title, normalizedTitle: survivor.normalizedTitle, city: survivor.city, state: survivor.state },
    mergedIds: []
  };
  // Written before anything moves, then again after each step, so an interrupted
  // run is still reversible.
  writeFileSync(UNDO, JSON.stringify(record, null, 2));
  for (const o of others) {
    const res = await mergeJobs(survivor.id, o.id, "scripts/paycom-lst-merge.ts");
    if (!res.success) throw new Error(res.message);
    record.mergedIds.push(o.id);
    writeFileSync(UNDO, JSON.stringify(record, null, 2));
    console.log(`MERGED ${o.title} -> ${survivor.title}: ${res.affectedRecords.applications} applications moved`);
  }
  await prisma.job.update({
    where: { id: survivor.id },
    data: { title: NEW_TITLE, normalizedTitle: normalizeTitle(NEW_TITLE), city: BASES, state: null }
  });
  console.log(`RENAMED to "${NEW_TITLE}", location "${BASES}". Undo: npx tsx scripts/paycom-lst-merge.ts --undo`);
}

main()
  .catch((e) => {
    console.error("FAILED:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
