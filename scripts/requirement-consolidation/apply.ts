import "dotenv/config";
import { writeFileSync, readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../prisma/generated/client/client";
import { rankGroup, resolveSurvivingJobId } from "./select";

/**
 * Apply the consolidation described by plan.ts. Run plan.ts and read PLAN.txt first.
 *
 * Three changes, all reversible:
 *   1. A job that is OPEN yet still carries a merge pointer has that pointer
 *      cleared — it is a contradiction, and it hides a live role's requirement.
 *   2. Each surviving requirement is re-pointed at the job that actually survived
 *      the merge, so the page stops hiding it.
 *   3. Every other requirement in the role is set to HISTORICAL. NOTHING IS
 *      DELETED — gates, change history, applications and managed variants stay.
 *
 * Every previous value is written to UNDO.json before anything changes. Re-run
 * with --undo to put it all back exactly as it was.
 *
 *   npx tsx scripts/requirement-consolidation/apply.ts          # writes
 *   npx tsx scripts/requirement-consolidation/apply.ts --undo   # reverts
 */

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const UNDO_PATH = "scripts/requirement-consolidation/UNDO.json";

type Undo = {
  writtenAt: string;
  jobs: Array<{ id: string; mergedIntoJobId: string | null }>;
  requirements: Array<{ id: string; status: string; sourceJobRecordId: string | null }>;
};

async function undo() {
  const saved = JSON.parse(readFileSync(UNDO_PATH, "utf8")) as Undo;
  console.log(`Reverting the run from ${saved.writtenAt}…`);
  for (const j of saved.jobs) {
    await prisma.job.update({ where: { id: j.id }, data: { mergedIntoJobId: j.mergedIntoJobId } });
  }
  for (const r of saved.requirements) {
    await prisma.pilotRequirement.update({
      where: { id: r.id },
      data: { status: r.status, sourceJobRecordId: r.sourceJobRecordId }
    });
  }
  console.log(`Restored ${saved.jobs.length} job(s) and ${saved.requirements.length} requirement(s).`);
}

async function apply() {
  const allJobs = await prisma.job.findMany({ select: { id: true, title: true, status: true, mergedIntoJobId: true } });
  const jobMap = new Map(allJobs.map((j) => [j.id, j]));

  const reqs = await prisma.pilotRequirement.findMany({
    include: { gates: { select: { enabled: true } } }
  });

  const undoRecord: Undo = { writtenAt: new Date().toISOString(), jobs: [], requirements: [] };

  // 1. OPEN jobs must not carry a merge pointer.
  const contradictory = allJobs.filter((j) => j.status === "OPEN" && j.mergedIntoJobId);
  for (const j of contradictory) undoRecord.jobs.push({ id: j.id, mergedIntoJobId: j.mergedIntoJobId });

  // Work out every requirement change BEFORE writing, so the undo file is
  // complete even if a write fails partway.
  const repoint: Array<{ id: string; to: string | null }> = [];
  const retire: string[] = [];

  const groups = new Map<string, typeof reqs>();
  for (const r of reqs) {
    if (!r.fleetPositionSlug) continue; // ambiguous — deliberately untouched
    groups.set(r.fleetPositionSlug, [...(groups.get(r.fleetPositionSlug) ?? []), r]);
  }

  for (const members of groups.values()) {
    const ranked = rankGroup(members);
    const keeper = ranked[0];

    if (keeper.sourceJobRecordId) {
      const sourceJob = jobMap.get(keeper.sourceJobRecordId);
      // Treat the contradiction as already fixed: an OPEN job keeps its own id.
      const isContradictory = sourceJob?.status === "OPEN" && sourceJob.mergedIntoJobId;
      const surviving = isContradictory
        ? keeper.sourceJobRecordId
        : resolveSurvivingJobId(keeper.sourceJobRecordId, jobMap);
      if (surviving && surviving !== keeper.sourceJobRecordId) {
        repoint.push({ id: keeper.id, to: surviving });
      } else if (!surviving) {
        // Merge chain is broken or circular — detaching still un-hides it, and a
        // requirement with no source job is explicitly allowed to show.
        repoint.push({ id: keeper.id, to: null });
      }
    }

    for (const loser of ranked.slice(1)) {
      if (loser.status !== "HISTORICAL") retire.push(loser.id);
    }
  }

  for (const r of reqs) {
    if (repoint.some((p) => p.id === r.id) || retire.includes(r.id)) {
      undoRecord.requirements.push({ id: r.id, status: r.status, sourceJobRecordId: r.sourceJobRecordId });
    }
  }

  writeFileSync(UNDO_PATH, JSON.stringify(undoRecord, null, 2), "utf8");
  console.log(`Undo snapshot written to ${UNDO_PATH} (${undoRecord.jobs.length} jobs, ${undoRecord.requirements.length} requirements).`);

  for (const j of contradictory) {
    await prisma.job.update({ where: { id: j.id }, data: { mergedIntoJobId: null } });
    console.log(`  cleared stale merge pointer on "${j.title}"`);
  }
  for (const p of repoint) {
    await prisma.pilotRequirement.update({ where: { id: p.id }, data: { sourceJobRecordId: p.to } });
  }
  for (const id of retire) {
    await prisma.pilotRequirement.update({ where: { id }, data: { status: "HISTORICAL" } });
  }

  console.log(`  re-pointed ${repoint.length} keeper(s) at the surviving job`);
  console.log(`  retired ${retire.length} duplicate(s) as HISTORICAL (none deleted)`);
}

(async () => {
  try {
    if (process.argv.includes("--undo")) await undo();
    else await apply();
  } finally {
    await prisma.$disconnect();
  }
})();
