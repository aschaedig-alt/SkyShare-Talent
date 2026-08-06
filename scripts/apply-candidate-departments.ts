/**
 * Apply the reviewed candidate departments, per the user's decisions on Aug 6.
 *
 * DECISIONS ENCODED HERE (all four came from the user, none are inferred):
 *   1. Pilots AND cabin attendants are Flight Ops. So the one job filed under
 *      "Operations" - Corporate Cabin Attendant, RETIRED, 284 applicants - is
 *      really Flight Operations. Fixed at SOURCE (the job's own department)
 *      rather than by mapping the word, so the 284 derive correctly and the
 *      special case in lib/candidates/departments.ts can go.
 *   2. Applied to a pilot role -> Flight Ops. Already how proposeDepartment
 *      behaves; confirmed, not changed.
 *   3. Every proposal on the review screen is approved as-is.
 *   4. The three the screen could not place: Fred Saadat -> flight-ops (pilot),
 *      Rich Paden and Don George -> maintenance.
 *
 * SAFETY. Dry run by default; --apply writes. Every write sets
 * Candidate.departmentOverride, which was null for all 305 of these before this
 * ran - so THE PLAN FILE IS THE UNDO LIST: setting those ids back to null
 * restores the previous state exactly. --undo does that from the file.
 *
 * scripts/out/ is gitignored, so the plan file holding 305 candidate names stays
 * OFF the repo and is local to whoever ran it. Re-running the dry run rebuilds it
 * identically, since the population is defined by a query rather than the file.
 *
 *   npx tsx scripts/apply-candidate-departments.ts                 # dry run
 *   npx tsx scripts/apply-candidate-departments.ts --apply --limit 10
 *   npx tsx scripts/apply-candidate-departments.ts --apply
 *   npx tsx scripts/apply-candidate-departments.ts --undo
 */
import "dotenv/config";
import { writeFileSync, readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/client/client";
import {
  proposeDepartment,
  candidateDepartmentFromRaw,
  type CandidateDepartmentKey
} from "../lib/candidates/departments";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
});

const APPLY = process.argv.includes("--apply");
const UNDO = process.argv.includes("--undo");
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;
const PLAN_FILE = "scripts/out/department-apply-plan.csv";

/** The job whose department is the word "Operations", and what it should say. */
const OPS_JOB_TITLE = "Corporate Cabin Attendant";
const OPS_OLD = "Operations";
const OPS_NEW = "Flight Operations";

/** The three the evidence could not place. Keyed by name, asserted unique. */
const MANUAL: Record<string, CandidateDepartmentKey> = {
  "Fred Saadat": "flight-ops",
  "Rich Paden": "maintenance",
  "Don George": "maintenance"
};

type PlanRow = { id: string; name: string; department: CandidateDepartmentKey; why: string };

async function buildPlan(): Promise<PlanRow[]> {
  // The query the review screen runs, MINUS its departmentOverride: null filter.
  // Dropping that filter is what makes this population stable across runs: with
  // it, a second pass sees only the candidates the first pass had not reached
  // yet, which would shrink the plan file - and the plan file is the undo list.
  // Rows already written are simply re-written with the same value.
  const rows = await prisma.candidate.findMany({
    where: {
      archivedAt: null,
      NOT: { applications: { some: { job: { department: { not: null } } } } }
    },
    select: {
      id: true, displayName: true, source: true, currentTitle: true, departmentOverride: true,
      applications: { select: { job: { select: { title: true } } } },
      files: { select: { documentType: true } }
    },
    orderBy: [{ displayName: "asc" }]
  });

  const plan: PlanRow[] = [];
  const unresolved: string[] = [];
  const manualSeen = new Map<string, number>();

  for (const c of rows) {
    const manual = MANUAL[c.displayName];
    if (manual) {
      manualSeen.set(c.displayName, (manualSeen.get(c.displayName) ?? 0) + 1);
      plan.push({ id: c.id, name: c.displayName, department: manual, why: "hand-set by the user Aug 6" });
      continue;
    }
    const p = proposeDepartment({
      jobTitles: c.applications.map((a) => a.job?.title),
      hasPilotApplication: c.files.some((f) => f.documentType === "Pilot Application"),
      source: c.source,
      currentTitle: c.currentTitle
    });
    if (!p.key) { unresolved.push(c.displayName); continue; }
    plan.push({ id: c.id, name: c.displayName, department: p.key, why: `${p.basis}: ${p.evidence ?? ""}` });
  }

  // A hand-set name that matched nothing, or matched twice, means this script is
  // about to write the wrong person's row. Refuse rather than guess.
  for (const name of Object.keys(MANUAL)) {
    const n = manualSeen.get(name) ?? 0;
    if (n !== 1) throw new Error(`"${name}" matched ${n} review rows, expected exactly 1. Refusing to write.`);
  }
  if (unresolved.length) throw new Error(`Still unplaced, not covered by a decision: ${unresolved.join(", ")}`);

  // An override that already disagrees with the plan is somebody else's edit, or
  // this script being run against a changed decision. Either way, stop.
  const existing = new Map(rows.map((r) => [r.id, r.departmentOverride]));
  const conflicts = plan.filter((p) => {
    const cur = existing.get(p.id);
    return cur !== null && cur !== undefined && cur !== p.department;
  });
  if (conflicts.length) {
    throw new Error(`${conflicts.length} candidates already have a DIFFERENT department set (e.g. ${conflicts[0].name}). Refusing to overwrite.`);
  }

  return plan;
}

async function main() {
  if (UNDO) {
    const ids = readFileSync(PLAN_FILE, "utf8").trim().split("\n").slice(1)
      .map((l) => l.split(",")[0]).filter(Boolean);
    console.log(`UNDO: clearing departmentOverride on ${ids.length} candidates from ${PLAN_FILE}`);
    if (!APPLY) { console.log("Dry run. Add --apply to actually clear."); return; }
    const r = await prisma.candidate.updateMany({ where: { id: { in: ids } }, data: { departmentOverride: null } });
    console.log(`Cleared ${r.count}.`);
    return;
  }

  // ---- 1. The job -------------------------------------------------------
  const opsJobs = await prisma.job.findMany({
    where: { department: OPS_OLD },
    select: { id: true, title: true, status: true, _count: { select: { applications: true } } }
  });
  console.log(`JOBS WITH department="${OPS_OLD}": ${opsJobs.length}`);
  for (const j of opsJobs) console.log(`  ${j.title} [${j.status}] ${j._count.applications} applications`);

  // Idempotent: re-running after the job is fixed must be a no-op, not a
  // failure, or the second half of a batched apply can never run. But zero
  // matches only counts as "already done" if the job actually says OPS_NEW -
  // an absence on its own proves nothing.
  let jobToFix: string | null = null;
  if (opsJobs.length === 1 && opsJobs[0].title === OPS_JOB_TITLE) {
    jobToFix = opsJobs[0].id;
    console.log(`  -> would set department to "${OPS_NEW}" (derives to ${candidateDepartmentFromRaw(OPS_NEW)})`);
  } else if (opsJobs.length === 0) {
    const already = await prisma.job.findFirst({ where: { title: OPS_JOB_TITLE }, select: { department: true } });
    if (already?.department !== OPS_NEW) {
      throw new Error(`No job has department "${OPS_OLD}", but "${OPS_JOB_TITLE}" says "${already?.department ?? "(missing)"}" not "${OPS_NEW}". Refusing to write.`);
    }
    console.log(`  -> already "${OPS_NEW}"; nothing to do.`);
  } else {
    throw new Error(`Expected exactly one job titled "${OPS_JOB_TITLE}". Refusing to write.`);
  }

  // ---- 2. The candidates ------------------------------------------------
  const plan = await buildPlan();
  const byDept = new Map<string, number>();
  for (const r of plan) byDept.set(r.department, (byDept.get(r.department) ?? 0) + 1);
  console.log(`\nCANDIDATE OVERRIDES TO WRITE: ${plan.length}`);
  for (const [d, n] of [...byDept].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${d}`);

  writeFileSync(PLAN_FILE, ["id,name,department,why", ...plan.map((r) =>
    `${r.id},"${r.name.replace(/"/g, "'")}",${r.department},"${r.why.replace(/"/g, "'")}"`)].join("\n") + "\n");
  console.log(`\nPlan written to ${PLAN_FILE} (this is the undo list).`);

  if (!APPLY) { console.log("\nDRY RUN. Nothing written. Add --apply to write."); return; }

  // Job first, so the 284 cabin-attendant applicants derive correctly.
  if (jobToFix) {
    const jobResult = await prisma.job.update({
      where: { id: jobToFix }, data: { department: OPS_NEW }, select: { title: true, department: true }
    });
    console.log(`\nJOB UPDATED: "${jobResult.title}" department is now "${jobResult.department}"`);
  }

  const slice = plan.slice(0, LIMIT === Infinity ? plan.length : LIMIT);
  const grouped = new Map<CandidateDepartmentKey, string[]>();
  for (const r of slice) grouped.set(r.department, [...(grouped.get(r.department) ?? []), r.id]);

  let updated = 0;
  for (const [department, ids] of grouped) {
    const r = await prisma.candidate.updateMany({ where: { id: { in: ids } }, data: { departmentOverride: department } });
    console.log(`  ${department}: ${r.count} written`);
    updated += r.count;
  }
  console.log(`WROTE ${updated} of ${plan.length}.`);
}

main()
  .catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); })
  .finally(() => prisma.$disconnect());
