/**
 * Fix pilot vs support classification on live jobs, from the title.
 *
 * Classification is derived by the SAME helpers the importer uses (isPilotTitle /
 * detectSeat / extractAircraftTypes), so a corrected job matches how an imported
 * one would classify. SURGICAL: it only touches the classification fields
 * (isPilotRole, isPilotLeadershipRole, pilotSeat, aircraftTypesJson, roleCategory)
 * — it deliberately does NOT create pilot requirements the way the app's editor
 * does, because 12 of the misclassified pilot jobs are RETIRED and that would
 * dump dead roles into the Matcher.
 *
 * The one exception is the reverse case: a job wrongly marked pilot may carry an
 * orphan pilot requirement, which is deleted (and recorded for undo).
 *
 * Dry-run by default -> writes a review file. --apply to write + record undo.
 * --undo to revert from the recorded file.
 *
 * Skips MERGED jobs (already-resolved duplicates).
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/client/client";
import { isPilotTitle, detectSeat, extractAircraftTypes } from "../lib/imports/job-import";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const APPLY = process.argv.includes("--apply");
const UNDO = process.argv.includes("--undo");
const OUT_DIR = join(process.cwd(), "scripts", "_reclassify_output");
const REVIEW = join(OUT_DIR, "review.csv");
const UNDO_FILE = join(OUT_DIR, "applied.json");

type Before = {
  id: string;
  title: string;
  status: string;
  isPilotRole: boolean;
  isPilotLeadershipRole: boolean;
  pilotSeat: string | null;
  aircraftTypesJson: string | null;
  roleCategory: string | null;
  deletedRequirementIds: string[];
};

function targetFor(job: {
  title: string;
  department: string | null;
}): { isPilotRole: boolean; isPilotLeadershipRole: boolean; pilotSeat: string | null; aircraftTypesJson: string | null; roleCategory: string | null } {
  const pilot = isPilotTitle(job.title);
  if (pilot) {
    const aircraft = extractAircraftTypes(job.title);
    return {
      isPilotRole: true,
      isPilotLeadershipRole: /\b(chief pilot|assistant chief pilot)\b/i.test(job.title),
      pilotSeat: detectSeat(job.title),
      aircraftTypesJson: aircraft.length ? JSON.stringify(aircraft) : null,
      roleCategory: "Pilot"
    };
  }
  // Support: same rule the app editor uses for the category.
  const supportCategory = job.department && job.department.toLowerCase() !== "pilot" ? job.department : "Support";
  return { isPilotRole: false, isPilotLeadershipRole: false, pilotSeat: null, aircraftTypesJson: null, roleCategory: supportCategory };
}

async function runUndo() {
  if (!existsSync(UNDO_FILE)) {
    console.error("No applied.json to undo from.");
    process.exit(1);
  }
  const rows = JSON.parse(readFileSync(UNDO_FILE, "utf8")) as Before[];
  console.log(`Reverting ${rows.length} job(s) to their pre-change classification...`);
  for (const b of rows) {
    await prisma.job.update({
      where: { id: b.id },
      data: {
        isPilotRole: b.isPilotRole,
        isPilotLeadershipRole: b.isPilotLeadershipRole,
        pilotSeat: b.pilotSeat,
        aircraftTypesJson: b.aircraftTypesJson,
        roleCategory: b.roleCategory
      }
    });
    if (b.deletedRequirementIds.length) {
      console.log(`   note: ${b.title} had ${b.deletedRequirementIds.length} requirement(s) deleted; NOT recreated (they were wrong data).`);
    }
  }
  console.log("Done. (Deleted orphan requirements are not recreated by undo.)");
}

async function main() {
  if (UNDO) return runUndo();

  const jobs = await prisma.job.findMany({
    where: { status: { not: "MERGED" } },
    select: {
      id: true,
      title: true,
      status: true,
      department: true,
      isPilotRole: true,
      isPilotLeadershipRole: true,
      pilotSeat: true,
      aircraftTypesJson: true,
      roleCategory: true
    },
    orderBy: { title: "asc" }
  });

  const changes: Array<{ job: (typeof jobs)[number]; target: ReturnType<typeof targetFor> }> = [];
  for (const job of jobs) {
    const target = targetFor(job);
    if (target.isPilotRole !== job.isPilotRole) changes.push({ job, target });
  }

  const lines = ["title,status,from,to,new_seat"];
  for (const { job, target } of changes) {
    lines.push(
      [job.title.replace(/,/g, ";"), job.status, job.isPilotRole ? "PILOT" : "SUPPORT", target.isPilotRole ? "PILOT" : "SUPPORT", target.pilotSeat ?? ""].join(",")
    );
  }
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(REVIEW, lines.join("\n"), "utf8");

  const toPilot = changes.filter((c) => c.target.isPilotRole).length;
  const toSupport = changes.filter((c) => !c.target.isPilotRole).length;
  console.log(`${changes.length} job(s) to reclassify: ${toPilot} -> PILOT, ${toSupport} -> SUPPORT`);
  console.log(`Review file: ${REVIEW}`);

  if (!APPLY) {
    console.log("\nDRY RUN. Re-run with --apply to write.");
    return;
  }

  const undo: Before[] = [];
  for (const { job, target } of changes) {
    let deletedRequirementIds: string[] = [];
    // Only when flipping pilot -> support: clear any orphan pilot requirement.
    if (!target.isPilotRole && job.isPilotRole) {
      const reqs = await prisma.pilotRequirement.findMany({ where: { sourceJobRecordId: job.id }, select: { id: true } });
      deletedRequirementIds = reqs.map((r) => r.id);
      if (deletedRequirementIds.length) {
        await prisma.pilotRequirement.deleteMany({ where: { sourceJobRecordId: job.id } });
      }
    }
    undo.push({
      id: job.id,
      title: job.title,
      status: job.status,
      isPilotRole: job.isPilotRole,
      isPilotLeadershipRole: job.isPilotLeadershipRole,
      pilotSeat: job.pilotSeat,
      aircraftTypesJson: job.aircraftTypesJson,
      roleCategory: job.roleCategory,
      deletedRequirementIds
    });
    await prisma.job.update({
      where: { id: job.id },
      data: {
        isPilotRole: target.isPilotRole,
        isPilotLeadershipRole: target.isPilotLeadershipRole,
        pilotSeat: target.pilotSeat,
        aircraftTypesJson: target.aircraftTypesJson,
        roleCategory: target.roleCategory
      }
    });
  }
  writeFileSync(UNDO_FILE, JSON.stringify(undo, null, 2), "utf8");
  console.log(`\nAPPLIED ${undo.length} change(s). Undo recorded at ${UNDO_FILE}`);
  console.log(`Revert with: npx tsx scripts/reclassify-jobs.ts --undo`);
}

main()
  .catch((e) => {
    console.error("FAILED:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
