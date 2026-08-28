/**
 * Reconcile ACTIVE pilot requirements against the roles we are actually hiring for.
 *
 * WHY. The Matchboard lists PilotRequirement rows with status ACTIVE
 * (lib/matching/matchboard.ts). Nothing keeps that in step with whether the role is
 * open: retiring a job does not touch its requirement, and a managed-aircraft role
 * often has no job row at all. Measured 2026-08-28: 27 ACTIVE requirements, of which
 * only 4 matched the open-roles list.
 *
 * WHAT IT DOES NOT DO. It does not delete anything, and it does not create the roles
 * that are missing from the app (Praetor 600, Challenger 350 First Officer,
 * Single-Pilot Jet Captain in Georgia, five support roles). Deactivated requirements
 * keep every gate, every field and every linked application - applications hang off
 * the Job, not the requirement - so this is fully reversible.
 *
 * INACTIVE, not HISTORICAL, on purpose: /api/pilot-requirements treats ACTIVE,
 * INACTIVE and EVERGREEN as "a current requirement exists for this role", so an
 * INACTIVE row still blocks someone creating a duplicate for the same fleet position.
 * HISTORICAL would not.
 *
 *   npx tsx scripts/reconcile-open-roles.ts            # dry run -> review file
 *   npx tsx scripts/reconcile-open-roles.ts --apply    # write + record undo
 *   npx tsx scripts/reconcile-open-roles.ts --undo     # revert from the record
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/client/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const APPLY = process.argv.includes("--apply");
const UNDO = process.argv.includes("--undo");
const OUT_DIR = join(process.cwd(), "scripts", "_reconcile_output");
const UNDO_FILE = join(OUT_DIR, "undo-open-roles.json");
const REVIEW_FILE = join(OUT_DIR, "review-open-roles.txt");

/** Stays on the Matchboard. Confirmed against the open-roles list 2026-08-28. */
const KEEP_ACTIVE = [
  "G450 & GV Captain",
  "G200 First Officer",
  "PC-12 Captain",
  "Evergreen PDP",
  // Held ACTIVE pending one answer: whether "PC-12 SIC (PDP) Evergreen" on the open
  // list is this row, the Evergreen PDP row, or both. Over-including is the safe way
  // to be wrong - it leaves a role scannable rather than silently switching it off.
  "PC-12 First Officer"
];

/** Not on the open-roles list -> stop scanning. Title is unique among ACTIVE rows. */
const DEACTIVATE = [
  "560XLS+ Captain",
  "560XLS+ First Officer",
  "CJ Captain",
  "Citation 560XL First Officer",
  "Citation CE-525 (CJ2) Captain",
  "Citation CE-525 First Officer",
  "Citation CE525 Captain",
  "Citation M2 First Officer",
  "G450 Aircraft Maintenance Technician",
  "Gulfstream G200 Captain",
  "Gulfstream G450 & GV First Officer (Home-Based)",
  "Gulfstream G450 Captain",
  "Gulfstream G450 First Officer",
  "Gulfstream G450 Lead Captain",
  "Legacy 650 Captain",
  "Legacy 650 Lead Captain",
  "M2 Captain",
  "Phenom 100 Captain",
  "Phenom 100 First Officer",
  "Phenom 300 Captain",
  "Phenom 300 First Officer",
  "Pilatus PC-12 NG Lead Captain"
];

/** Mistagged operator, per his correction: these two are not managed aircraft. */
const RETAG_SKYSHARE = ["Gulfstream G200 Captain", "Citation 560XL First Officer"];

/**
 * The Nevada G450 First Officer seat. The live row is tagged SkyShare with no tail
 * while its correctly-tagged Managed twin sits HISTORICAL, which is why the Henderson
 * trio did not read as one set. Tag the LIVE row (it holds the 222 applications
 * through its job) rather than reviving the twin.
 */
const RETAG_MANAGED_N787JS = "Gulfstream G450 First Officer";

type Change = {
  id: string;
  title: string;
  field: string;
  from: string | null;
  to: string | null;
  note: string;
};

type ActiveRequirement = {
  id: string;
  title: string;
  status: string;
  operatorType: string | null;
  fleetPositionSlug: string | null;
  managedVariants: Array<{ id: string; tailNumber: string }>;
  sourceJobRecord: {
    title: string;
    status: string;
    city: string | null;
    state: string | null;
    _count: { applications: number };
  } | null;
};

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  if (UNDO) return undo();

  const active: ActiveRequirement[] = await prisma.pilotRequirement.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      title: true,
      status: true,
      operatorType: true,
      fleetPositionSlug: true,
      managedVariants: { select: { id: true, tailNumber: true } },
      sourceJobRecord: {
        select: { title: true, status: true, city: true, state: true, _count: { select: { applications: true } } }
      }
    },
    orderBy: { title: "asc" }
  });

  const byTitle = new Map<string, ActiveRequirement[]>();
  for (const requirement of active) {
    const list = byTitle.get(requirement.title) ?? [];
    list.push(requirement);
    byTitle.set(requirement.title, list);
  }

  // Fail loudly rather than guessing. A title that matches zero or two ACTIVE rows
  // means the data moved under this script and the hardcoded lists are stale.
  const problems: string[] = [];
  for (const title of [...KEEP_ACTIVE, ...DEACTIVATE]) {
    const hits = byTitle.get(title) ?? [];
    if (hits.length !== 1) problems.push(`"${title}" matched ${hits.length} ACTIVE requirements (expected exactly 1)`);
  }
  const covered = new Set([...KEEP_ACTIVE, ...DEACTIVATE]);
  for (const requirement of active) {
    if (!covered.has(requirement.title)) {
      problems.push(`ACTIVE requirement "${requirement.title}" is in neither list - it would be left untouched`);
    }
  }

  const changes: Change[] = [];
  const variantAdds: Array<{ requirementId: string; title: string; tailNumber: string }> = [];

  for (const title of DEACTIVATE) {
    const requirement = byTitle.get(title)?.[0];
    if (!requirement) continue;
    const job = requirement.sourceJobRecord;
    const tail = requirement.managedVariants.length
      ? ` tail ${requirement.managedVariants.map((variant) => variant.tailNumber).join("/")}`
      : "";
    const jobNote = job
      ? `${job.status} ${[job.city, job.state].filter(Boolean).join(" ")} ${job._count.applications}app`
      : "none";
    changes.push({
      id: requirement.id,
      title,
      field: "status",
      from: requirement.status,
      to: "INACTIVE",
      note: `${requirement.operatorType ?? "no operator"}${tail} | job: ${jobNote}`
    });
  }

  for (const title of RETAG_SKYSHARE) {
    const requirement = byTitle.get(title)?.[0];
    if (!requirement || requirement.operatorType === "SkyShare") continue;
    changes.push({
      id: requirement.id,
      title,
      field: "operatorType",
      from: requirement.operatorType,
      to: "SkyShare",
      note: "not a managed aircraft"
    });
  }

  const g450FirstOfficer = byTitle.get(RETAG_MANAGED_N787JS)?.[0];
  if (g450FirstOfficer) {
    if (g450FirstOfficer.operatorType !== "Managed") {
      changes.push({
        id: g450FirstOfficer.id,
        title: g450FirstOfficer.title,
        field: "operatorType",
        from: g450FirstOfficer.operatorType,
        to: "Managed",
        note: "Henderson NV managed tail, was mistagged SkyShare"
      });
    }
    if (!g450FirstOfficer.managedVariants.some((variant) => variant.tailNumber === "N787JS")) {
      variantAdds.push({ requirementId: g450FirstOfficer.id, title: g450FirstOfficer.title, tailNumber: "N787JS" });
    }
  }

  const lines: string[] = [];
  lines.push(`RECONCILE OPEN ROLES - ${APPLY ? "APPLIED" : "DRY RUN, nothing written"}`);
  lines.push(`generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`ACTIVE requirements before: ${active.length}`);
  lines.push(`staying ACTIVE:             ${KEEP_ACTIVE.length}  (${KEEP_ACTIVE.join(", ")})`);
  lines.push(`becoming INACTIVE:          ${DEACTIVATE.length}`);
  lines.push("");
  if (problems.length) {
    lines.push("*** PROBLEMS - resolve before applying ***");
    for (const problem of problems) lines.push(`  ! ${problem}`);
    lines.push("");
  }
  lines.push("--- status changes (reversible; gates, fields and applications all kept) ---");
  for (const change of changes.filter((change) => change.field === "status")) {
    lines.push(`  ${change.title.padEnd(48)} ${change.from} -> ${change.to}   [${change.note}]`);
  }
  lines.push("");
  lines.push("--- operatorType corrections ---");
  for (const change of changes.filter((change) => change.field === "operatorType")) {
    lines.push(`  ${change.title.padEnd(48)} ${change.from ?? "null"} -> ${change.to}   [${change.note}]`);
  }
  lines.push("");
  lines.push("--- managed variants to attach ---");
  for (const variant of variantAdds) {
    lines.push(`  ${variant.title.padEnd(48)} + tail ${variant.tailNumber}`);
  }
  lines.push("");
  lines.push(`Matchboard after: ${active.length - DEACTIVATE.length} roles.`);

  const report = lines.join("\n");
  writeFileSync(REVIEW_FILE, report, "utf8");
  console.log(report);
  console.log(`\nreview file: ${REVIEW_FILE}`);

  if (!APPLY) {
    console.log("\nDRY RUN - nothing was written. Re-run with --apply to write.");
    return;
  }
  if (problems.length) {
    console.log("\nREFUSING TO APPLY while problems are listed above.");
    return;
  }

  writeFileSync(UNDO_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), changes, variantAdds }, null, 2), "utf8");

  for (const change of changes) {
    await prisma.pilotRequirement.update({ where: { id: change.id }, data: { [change.field]: change.to } });
  }
  for (const variant of variantAdds) {
    await prisma.managedVariant.create({
      data: {
        pilotRequirementId: variant.requirementId,
        tailNumber: variant.tailNumber,
        status: "ACTIVE",
        notes: "Henderson NV G450, attached during the 2026-08-28 open-roles reconcile"
      }
    });
  }
  console.log(`\nAPPLIED ${changes.length} field changes and ${variantAdds.length} variant attachments.`);
  console.log(`undo record: ${UNDO_FILE}`);
}

async function undo() {
  if (!existsSync(UNDO_FILE)) {
    console.log(`No undo record at ${UNDO_FILE}`);
    return;
  }
  const record = JSON.parse(readFileSync(UNDO_FILE, "utf8")) as {
    changes: Change[];
    variantAdds: Array<{ requirementId: string; tailNumber: string }>;
  };
  for (const change of record.changes) {
    await prisma.pilotRequirement.update({ where: { id: change.id }, data: { [change.field]: change.from } });
  }
  for (const variant of record.variantAdds) {
    await prisma.managedVariant.deleteMany({ where: { pilotRequirementId: variant.requirementId, tailNumber: variant.tailNumber } });
  }
  console.log(`Reverted ${record.changes.length} field changes and removed ${record.variantAdds.length} variant attachments.`);
}

main().finally(() => prisma.$disconnect());
