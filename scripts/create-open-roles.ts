/**
 * Create the open roles that exist in the recruiter's head but not in the app, and
 * consolidate the duplicates he named.
 *
 * Companion to scripts/reconcile-open-roles.ts, which switched OFF the roles we are
 * not hiring for. This one adds the ones that were missing and folds the duplicate
 * job rows together.
 *
 * HOUR GATES ARE COPIED, NOT GUESSED. He confirmed that G200, Challenger 350 and
 * Praetor 600 share the same hour requirements for PIC and for SIC seats - the
 * difference between them is SkyShare vs managed, not the minimums. So the new
 * requirements clone their gates from the existing G200 Captain (PIC) and G200 First
 * Officer (SIC) rows rather than re-deriving numbers from job text.
 *
 * Two gates are NOT copied blindly:
 *   - slc_relocation is turned off for the Ogden-based Praetor roles.
 *   - Single-Pilot Jet Captain (Georgia) gets NO hour gates at all. Its only source
 *     row is a retired job with an empty description (0 characters), so there is
 *     nothing to copy and inventing numbers for a single-pilot jet would be worse
 *     than leaving it flagged. It lands NEEDS_REVIEW with the certificate gates only.
 *
 * Everything is reversible: created rows are recorded by id and deleted on --undo,
 * changed fields are recorded with their previous value, and merges go through
 * lib/jobs/merge.ts so undoMerge can put the applications back.
 *
 *   npx tsx scripts/create-open-roles.ts            # dry run -> review file
 *   npx tsx scripts/create-open-roles.ts --apply    # write + record undo
 *   npx tsx scripts/create-open-roles.ts --undo     # revert from the record
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/client/client";
import { mergeJobs, undoMerge } from "../lib/jobs/merge";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const APPLY = process.argv.includes("--apply");
const UNDO = process.argv.includes("--undo");
const OUT_DIR = join(process.cwd(), "scripts", "_reconcile_output");
const UNDO_FILE = join(OUT_DIR, "undo-create-roles.json");
const REVIEW_FILE = join(OUT_DIR, "review-create-roles.txt");

const PIC_TEMPLATE = "Gulfstream G200 Captain";
const SIC_TEMPLATE = "G200 First Officer";

type NewRole = {
  /** Job title. If a job with this exact title already exists, it is reused. */
  jobTitle: string;
  requirementTitle: string;
  seat: "PIC" | "SIC";
  operatorType: "SkyShare" | "Managed";
  tailNumber: string | null;
  city: string | null;
  state: string | null;
  airport: string | null;
  aircraft: string[];
  pay: string;
  /** null = do not copy hour gates from a template (certificates only). */
  template: string | null;
  disableGates: string[];
  note: string;
};

const NEW_PILOT_ROLES: NewRole[] = [
  {
    jobTitle: "Challenger 350 Captain",
    requirementTitle: "Challenger 350 Captain",
    seat: "PIC",
    operatorType: "Managed",
    tailNumber: "N522AD",
    city: "Salt Lake City",
    state: "UT",
    airport: "SLC",
    aircraft: ["Challenger 350"],
    pay: "$220,000 - $230,000",
    template: PIC_TEMPLATE,
    disableGates: [],
    note: "job already exists and is OPEN; only the requirement is created"
  },
  {
    jobTitle: "Challenger 350 First Officer",
    requirementTitle: "Challenger 350 First Officer",
    seat: "SIC",
    operatorType: "Managed",
    tailNumber: "N522AD",
    city: "Salt Lake City",
    state: "UT",
    airport: "SLC",
    aircraft: ["Challenger 350"],
    pay: "$130,000",
    template: SIC_TEMPLATE,
    disableGates: [],
    note: "new job and new requirement"
  },
  {
    jobTitle: "Praetor 600 Captain",
    requirementTitle: "Praetor 600 Captain",
    seat: "PIC",
    operatorType: "Managed",
    tailNumber: null,
    city: "Ogden",
    state: "UT",
    airport: "OGD",
    aircraft: ["Praetor 600"],
    pay: "$230,000 - $240,000",
    template: PIC_TEMPLATE,
    // Ogden-based, so the SLC relocation gate copied from the G200 template is wrong.
    disableGates: ["slc_relocation"],
    note: "managed, tail not known yet - attach the variant when it is"
  },
  {
    jobTitle: "Praetor 600 First Officer",
    requirementTitle: "Praetor 600 First Officer",
    seat: "SIC",
    operatorType: "Managed",
    tailNumber: null,
    city: "Ogden",
    state: "UT",
    airport: "OGD",
    aircraft: ["Praetor 600"],
    pay: "$130,000 - $140,000",
    template: SIC_TEMPLATE,
    disableGates: ["slc_relocation"],
    note: "managed, tail not known yet - attach the variant when it is"
  },
  {
    jobTitle: "Single-Pilot Jet Captain (Part 91, Georgia)",
    requirementTitle: "Single-Pilot Jet Captain (Georgia)",
    seat: "PIC",
    operatorType: "Managed",
    tailNumber: null,
    city: null,
    state: "GA",
    airport: null,
    aircraft: [],
    pay: "$160,000 - $180,000",
    // No template: the only Single-Pilot Jet row in the app is a retired job whose
    // description is 0 characters long. Nothing to copy.
    template: null,
    disableGates: [],
    note: "NEW role - the SLC one was filled and stays retired; hour gates need entering by hand"
  }
];

const NEW_SUPPORT_JOBS = [
  { title: "Vice President of Aircraft Sales (Brokerage)", city: "Salt Lake City", state: "UT", department: "Sales" },
  { title: "Sr. Staff Accountant", city: "Ogden", state: "UT", department: "Accounting" }
];

/** secondary title -> primary title. Applications and interviews move to the primary. */
const JOB_MERGES: Array<{ secondary: string; primary: string; why: string }> = [
  { secondary: "Evergreen PDP", primary: "PC-12 First Officer", why: "PDP evergreen is the PC-12 SIC role, not a separate one" },
  { secondary: "Pilatus PC-12 First Officer", primary: "PC-12 First Officer", why: "same role, older job row, holds 49 applications" },
  { secondary: "Aircraft Maintenance Technician (Weekend Shift)", primary: "Aircraft Maintenance Technician", why: "all AMT postings go under the one AMT job" },
  { secondary: "Senior Gulfstream Technician (AMT)", primary: "Aircraft Maintenance Technician", why: "all AMT postings go under the one AMT job" }
];

const JOBS_TO_RETIRE = ["Aircraft Maintenance Apprentice"];

/** Merged into PC-12 First Officer, so it stops being its own scannable role. */
const REQUIREMENTS_TO_DEACTIVATE = ["Evergreen PDP"];

type UndoRecord = {
  generatedAt: string;
  createdJobIds: string[];
  createdRequirementIds: string[];
  createdVariantIds: string[];
  fieldChanges: Array<{ model: "job" | "pilotRequirement"; id: string; field: string; from: string | null }>;
  merges: Array<{ secondaryJobId: string; secondaryTitle: string }>;
};

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  if (UNDO) return undo();

  const lines: string[] = [];
  const problems: string[] = [];
  lines.push(`CREATE OPEN ROLES - ${APPLY ? "APPLIED" : "DRY RUN, nothing written"}`);
  lines.push(`generated: ${new Date().toISOString()}`);
  lines.push("");

  // --- resolve the gate templates up front; without them nothing else is safe ---
  const templates = new Map<string, { id: string; gates: Array<{ catalogItemId: string | null; key: string; label: string; category: string; valueType: string; enabled: boolean; numericValue: number | null; textValue: string | null; sortOrder: number }> }>();
  for (const title of [PIC_TEMPLATE, SIC_TEMPLATE]) {
    const requirement = await prisma.pilotRequirement.findFirst({
      where: { title },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        gates: {
          select: { catalogItemId: true, key: true, label: true, category: true, valueType: true, enabled: true, numericValue: true, textValue: true, sortOrder: true },
          orderBy: { sortOrder: "asc" }
        }
      }
    });
    if (!requirement) {
      problems.push(`gate template "${title}" not found`);
      continue;
    }
    templates.set(title, requirement);
    const enabled = requirement.gates.filter((gate) => gate.enabled).length;
    lines.push(`template "${title}": ${requirement.gates.length} gates, ${enabled} enabled`);
  }
  lines.push("");

  const undoRecord: UndoRecord = {
    generatedAt: new Date().toISOString(),
    createdJobIds: [],
    createdRequirementIds: [],
    createdVariantIds: [],
    fieldChanges: [],
    merges: []
  };

  // --- pilot roles -------------------------------------------------------------
  lines.push("--- pilot roles ---");
  for (const role of NEW_PILOT_ROLES) {
    const existingJob = await prisma.job.findFirst({ where: { title: role.jobTitle, mergedIntoJobId: null }, select: { id: true, status: true } });
    const existingRequirement = await prisma.pilotRequirement.findFirst({ where: { title: role.requirementTitle }, select: { id: true, status: true } });

    const jobAction = existingJob ? `reuse existing job [${existingJob.status}]` : "CREATE job (OPEN)";
    const requirementAction = existingRequirement ? `requirement already exists [${existingRequirement.status}] - SKIPPING` : "CREATE requirement";
    const gateSource = role.template ? `gates from "${role.template}"${role.disableGates.length ? `, minus ${role.disableGates.join("/")}` : ""}` : "NO hour gates - needs entering by hand";
    lines.push(`  ${role.requirementTitle}`);
    lines.push(`      ${jobAction} | ${requirementAction}`);
    lines.push(`      ${role.operatorType}${role.tailNumber ? ` tail ${role.tailNumber}` : " (no tail yet)"} | ${[role.city, role.state].filter(Boolean).join(", ") || "no base"} | ${role.pay}`);
    lines.push(`      ${gateSource}`);
    lines.push(`      ${role.note}`);

    if (!APPLY) continue;

    let jobId = existingJob?.id ?? null;
    if (!jobId) {
      const job = await prisma.job.create({
        data: {
          title: role.jobTitle,
          normalizedTitle: role.jobTitle.toLowerCase().replace(/\s+/g, " ").trim(),
          status: "OPEN",
          city: role.city,
          state: role.state,
          department: "Pilot",
          roleCategory: "Pilot",
          isPilotRole: true,
          pilotSeat: role.seat,
          aircraftTypesJson: role.aircraft.length ? JSON.stringify(role.aircraft) : null,
          baseLocation: [role.city, role.state].filter(Boolean).join(", ") || null,
          paySummary: role.pay,
          rawPayScale: role.pay,
          source: "Created in app",
          openedDate: new Date(),
          importedAt: new Date()
        },
        select: { id: true }
      });
      jobId = job.id;
      undoRecord.createdJobIds.push(job.id);
    }

    if (existingRequirement) continue;

    const template = role.template ? templates.get(role.template) : null;
    const requirement = await prisma.pilotRequirement.create({
      data: {
        sourceJobRecordId: jobId,
        title: role.requirementTitle,
        normalizedTitle: role.requirementTitle.toLowerCase().replace(/\s+/g, " ").trim(),
        status: "ACTIVE",
        // Every one of these needs a human pass before it is trusted: the gates are
        // inherited from another aircraft, or absent entirely.
        reviewStatus: "NEEDS_REVIEW",
        operatorType: role.operatorType,
        roleCategory: "Pilot",
        pilotSeat: role.seat,
        aircraftTypesJson: role.aircraft.length ? JSON.stringify(role.aircraft) : null,
        baseCity: role.city,
        baseState: role.state,
        baseAirport: role.airport,
        payScaleRaw: role.pay,
        extractionWarningsJson: JSON.stringify([
          role.template
            ? `Hour gates copied from "${role.template}" - confirmed as identical minimums, but review before trusting a scan.`
            : "No hour gates. Enter the minimums by hand before scanning this role."
        ]),
        manualOverrideNotes: role.note,
        sourceHistoryJson: JSON.stringify([{ type: "create-open-roles-script", createdAt: new Date().toISOString(), template: role.template }])
      },
      select: { id: true }
    });
    undoRecord.createdRequirementIds.push(requirement.id);

    if (template) {
      await prisma.pilotRequirementGate.createMany({
        data: template.gates.map((gate) => ({
          pilotRequirementId: requirement.id,
          catalogItemId: gate.catalogItemId,
          key: gate.key,
          label: gate.label,
          category: gate.category,
          valueType: gate.valueType,
          enabled: role.disableGates.includes(gate.key) ? false : gate.enabled,
          numericValue: role.disableGates.includes(gate.key) ? null : gate.numericValue,
          textValue: role.disableGates.includes(gate.key) ? null : gate.textValue,
          sortOrder: gate.sortOrder
        }))
      });
    }

    if (role.tailNumber) {
      const variant = await prisma.managedVariant.create({
        data: {
          pilotRequirementId: requirement.id,
          tailNumber: role.tailNumber,
          baseCity: role.city,
          baseState: role.state,
          status: "ACTIVE",
          notes: "Attached during the 2026-08-28 open-roles build"
        },
        select: { id: true }
      });
      undoRecord.createdVariantIds.push(variant.id);
    }
  }
  lines.push("");

  // --- support jobs ------------------------------------------------------------
  lines.push("--- support jobs (no pilot requirement, they do not go on the Matchboard) ---");
  for (const support of NEW_SUPPORT_JOBS) {
    const existing = await prisma.job.findFirst({ where: { title: support.title, mergedIntoJobId: null }, select: { id: true, status: true } });
    lines.push(`  ${support.title.padEnd(48)} ${existing ? `already exists [${existing.status}] - SKIPPING` : "CREATE (OPEN)"}`);
    if (!APPLY || existing) continue;
    const job = await prisma.job.create({
      data: {
        title: support.title,
        normalizedTitle: support.title.toLowerCase().replace(/\s+/g, " ").trim(),
        status: "OPEN",
        city: support.city,
        state: support.state,
        department: support.department,
        roleCategory: support.department,
        isPilotRole: false,
        baseLocation: [support.city, support.state].filter(Boolean).join(", "),
        source: "Created in app",
        openedDate: new Date(),
        importedAt: new Date()
      },
      select: { id: true }
    });
    undoRecord.createdJobIds.push(job.id);
  }
  lines.push("");

  // --- merges ------------------------------------------------------------------
  lines.push("--- job merges (applications and interviews move to the primary) ---");
  for (const merge of JOB_MERGES) {
    const secondary = await prisma.job.findFirst({ where: { title: merge.secondary, mergedIntoJobId: null }, select: { id: true, status: true, _count: { select: { applications: true } } } });
    const primary = await prisma.job.findFirst({ where: { title: merge.primary, mergedIntoJobId: null }, select: { id: true, status: true, _count: { select: { applications: true } } } });
    if (!secondary || !primary) {
      lines.push(`  SKIP ${merge.secondary} -> ${merge.primary}  (${!secondary ? "secondary" : "primary"} not found or already merged)`);
      continue;
    }
    lines.push(`  ${merge.secondary} (${secondary._count.applications}app) -> ${merge.primary} (${primary._count.applications}app)`);
    lines.push(`      ${merge.why}`);
    if (!APPLY) continue;
    const result = await mergeJobs(primary.id, secondary.id, "create-open-roles script");
    if (!result.success) {
      problems.push(`merge failed: ${merge.secondary} -> ${merge.primary}: ${result.message}`);
      continue;
    }
    undoRecord.merges.push({ secondaryJobId: secondary.id, secondaryTitle: merge.secondary });
  }
  lines.push("");

  // --- repoint PC-12 First Officer onto its open job ---------------------------
  lines.push("--- requirement relinks ---");
  const pcFirstOfficer = await prisma.pilotRequirement.findFirst({
    where: { title: "PC-12 First Officer", status: "ACTIVE" },
    select: { id: true, sourceJobRecordId: true, sourceJobRecord: { select: { title: true, status: true } } }
  });
  const pcOpenJob = await prisma.job.findFirst({ where: { title: "PC-12 First Officer", mergedIntoJobId: null }, select: { id: true, status: true } });
  if (pcFirstOfficer && pcOpenJob && pcFirstOfficer.sourceJobRecordId !== pcOpenJob.id) {
    lines.push(`  PC-12 First Officer requirement: job "${pcFirstOfficer.sourceJobRecord?.title}" [${pcFirstOfficer.sourceJobRecord?.status}] -> "PC-12 First Officer" [${pcOpenJob.status}]`);
    if (APPLY) {
      undoRecord.fieldChanges.push({ model: "pilotRequirement", id: pcFirstOfficer.id, field: "sourceJobRecordId", from: pcFirstOfficer.sourceJobRecordId });
      await prisma.pilotRequirement.update({ where: { id: pcFirstOfficer.id }, data: { sourceJobRecordId: pcOpenJob.id } });
    }
  } else {
    lines.push("  PC-12 First Officer requirement: already pointing at the open job, or not found");
  }
  lines.push("");

  // --- deactivations and closures ---------------------------------------------
  lines.push("--- requirement deactivations ---");
  for (const title of REQUIREMENTS_TO_DEACTIVATE) {
    const requirement = await prisma.pilotRequirement.findFirst({ where: { title, status: "ACTIVE" }, select: { id: true, status: true } });
    lines.push(`  ${title.padEnd(48)} ${requirement ? `${requirement.status} -> INACTIVE` : "not ACTIVE - SKIPPING"}`);
    if (!APPLY || !requirement) continue;
    undoRecord.fieldChanges.push({ model: "pilotRequirement", id: requirement.id, field: "status", from: requirement.status });
    await prisma.pilotRequirement.update({ where: { id: requirement.id }, data: { status: "INACTIVE" } });
  }
  lines.push("");
  lines.push("--- job closures ---");
  for (const title of JOBS_TO_RETIRE) {
    const job = await prisma.job.findFirst({ where: { title, mergedIntoJobId: null }, select: { id: true, status: true, _count: { select: { applications: true } } } });
    lines.push(`  ${title.padEnd(48)} ${job ? `${job.status} -> RETIRED (${job._count.applications} applications kept)` : "not found - SKIPPING"}`);
    if (!APPLY || !job || job.status === "RETIRED") continue;
    undoRecord.fieldChanges.push({ model: "job", id: job.id, field: "status", from: job.status });
    await prisma.job.update({ where: { id: job.id }, data: { status: "RETIRED" } });
  }
  lines.push("");

  if (problems.length) {
    lines.push("*** PROBLEMS ***");
    for (const problem of problems) lines.push(`  ! ${problem}`);
    lines.push("");
  }

  const report = lines.join("\n");
  writeFileSync(REVIEW_FILE, report, "utf8");
  console.log(report);
  console.log(`\nreview file: ${REVIEW_FILE}`);

  if (!APPLY) {
    console.log("\nDRY RUN - nothing was written. Re-run with --apply to write.");
    return;
  }
  writeFileSync(UNDO_FILE, JSON.stringify(undoRecord, null, 2), "utf8");
  console.log(`\nAPPLIED. undo record: ${UNDO_FILE}`);
}

async function undo() {
  if (!existsSync(UNDO_FILE)) {
    console.log(`No undo record at ${UNDO_FILE}`);
    return;
  }
  const record = JSON.parse(readFileSync(UNDO_FILE, "utf8")) as UndoRecord;

  // Unmerge first, so applications are back on their own jobs before anything is
  // deleted underneath them.
  for (const merge of record.merges) {
    const result = await undoMerge(merge.secondaryJobId);
    console.log(`unmerge ${merge.secondaryTitle}: ${result.message}`);
  }
  for (const change of record.fieldChanges) {
    if (change.model === "job") await prisma.job.update({ where: { id: change.id }, data: { [change.field]: change.from } });
    else await prisma.pilotRequirement.update({ where: { id: change.id }, data: { [change.field]: change.from } });
  }
  await prisma.managedVariant.deleteMany({ where: { id: { in: record.createdVariantIds } } });
  await prisma.pilotRequirementGate.deleteMany({ where: { pilotRequirementId: { in: record.createdRequirementIds } } });
  await prisma.pilotRequirement.deleteMany({ where: { id: { in: record.createdRequirementIds } } });
  await prisma.job.deleteMany({ where: { id: { in: record.createdJobIds } } });
  console.log(`Reverted: ${record.merges.length} merges, ${record.fieldChanges.length} field changes, ${record.createdRequirementIds.length} requirements, ${record.createdJobIds.length} jobs.`);
}

main().finally(() => prisma.$disconnect());
