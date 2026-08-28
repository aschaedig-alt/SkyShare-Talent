/**
 * Rewrite the pilot requirements from the real job posts.
 *
 * WHY THIS EXISTS, AND WHY IT MATTERS. scripts/create-open-roles.ts built the
 * Challenger 350 and Praetor 600 roles by cloning the G200 gates, on the stated
 * basis that the hour minimums were identical. The actual posts say otherwise for
 * the PIC seats - four of six numbers differ, and every one of them differs in the
 * restrictive direction:
 *
 *   gate                cloned from G200   actual post
 *   multi_engine_time            3000         1000
 *   jet_time                     1000          800
 *   instrument_time               800          300
 *   time_in_type                  135    300 (CL350) / not required (Praetor)
 *
 * A gate that is too HIGH silently removes qualified people from a scan and looks
 * exactly like a thin candidate pool, so this is the failure mode worth correcting
 * fast. The SIC seats did match, apart from jet_time which the G200 row carried
 * with no number.
 *
 * Numbers here are transcribed from the four PDFs he sent (Challenger 350 PIC-SIC,
 * Praetor 600 PIC-SIC, Straight CJ PIC Georgia, PC-12 First Officer SIC). Anything
 * the post marks "preferred" is deliberately NOT made a hard gate - it goes in the
 * notes instead, because preferring something is not the same as filtering on it.
 *
 *   npx tsx scripts/apply-job-post-requirements.ts            # dry run
 *   npx tsx scripts/apply-job-post-requirements.ts --apply
 *   npx tsx scripts/apply-job-post-requirements.ts --undo
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
const OUT_DIR = join(process.cwd(), "scripts", "open-roles-reconcile");
const UNDO_FILE = join(OUT_DIR, "undo-job-post-requirements.json");
const REVIEW_FILE = join(OUT_DIR, "review-job-post-requirements.txt");

/** Managed owner-aircraft schedule, confirmed by him and by all three managed posts. */
const MANAGED_ROTATION = "As needed, 8 hard days off per month";

type RoleSpec = {
  requirementTitle: string;
  /** Hour gates with a real number in the post. Anything absent is cleared. */
  hours: Record<string, number>;
  /** Hour gates the post names without a number - enabled, no threshold. */
  hoursNoValue?: string[];
  boolsOn: string[];
  boolsOff: string[];
  pay: string;
  rotation: string;
  scheduleRaw: string;
  locationFit: string;
  baseCity: string | null;
  baseState: string;
  baseAirport: string | null;
  aircraft: string[];
  tailNumber?: string;
  notes: string;
  minimumRequirements: string;
};

const CERTS_STANDARD = [
  "commercial_certificate",
  "first_class_medical",
  "fcc_permit",
  "instrument_rating",
  "us_passport",
  "us_drivers_license",
  "current_ifr",
  "work_authorization",
  "training_contract"
];

const ROLES: RoleSpec[] = [
  {
    requirementTitle: "Challenger 350 Captain",
    hours: { total_time: 4500, pic_time: 3000, multi_engine_time: 1000, jet_time: 800, instrument_time: 300, time_in_type: 300 },
    boolsOn: [...CERTS_STANDARD, "atp_certificate", "fluid_schedule", "slc_relocation"],
    boolsOff: ["set_rotation", "part_135_required", "part_135_preferred", "international_required"],
    pay: "$220,000 - $230,000 annually",
    rotation: MANAGED_ROTATION,
    scheduleRaw: "Dedicated aircraft position supporting a private owner. Fluid, based on owner travel needs, with 8 hard days off per month. Days, nights, weekdays, weekends and holidays; overnight trips away from home.",
    locationFit: "Based in Salt Lake City, UT. Reside within approximately a 2-hour drive of Salt Lake City International Airport, or relocate within 2 months.",
    baseCity: "Salt Lake City",
    baseState: "UT",
    baseAirport: "SLC",
    aircraft: ["Challenger 350"],
    tailNumber: "N522AD",
    notes: "Prior flight experience operating to and from Hawaii is REQUIRED - there is no catalog gate for this, so it must be checked by hand. 300 hours in the Challenger 300/350 is a hard requirement.",
    minimumRequirements: [
      "Prior flight experience operating to and from Hawaii is required",
      "Minimum 4,500 hours total flight time, including:",
      "  3,000 hours PIC",
      "  1,000 hours multi-engine",
      "  800 hours jet",
      "  300 hours instrument",
      "  300 hours in the Challenger 300/350",
      "FAA Commercial or Airline Transport Pilot (ATP) Certificate with appropriate category and class",
      "Valid FAA 1st Class Medical Certificate",
      "FCC Restricted Radiotelephone Operator Permit",
      "FAA Instrument Rating",
      "Valid U.S. passport and driver's license",
      "Current IFR knowledge and experience",
      "Must be legally authorized to work in the United States without sponsorship"
    ].join("\n")
  },
  {
    requirementTitle: "Challenger 350 First Officer",
    hours: { total_time: 2000, multi_engine_time: 300, turbine_time: 200, jet_time: 200, instrument_time: 200 },
    boolsOn: [...CERTS_STANDARD, "fluid_schedule", "slc_relocation"],
    boolsOff: ["set_rotation", "atp_certificate", "part_135_required", "part_135_preferred", "international_required"],
    pay: "$130,000 annually",
    rotation: MANAGED_ROTATION,
    scheduleRaw: "Dedicated aircraft position supporting a private owner. Fluid, based on owner travel needs, with 8 hard days off per month. Days, nights, weekdays, weekends and holidays; overnight trips away from home.",
    locationFit: "Based in Salt Lake City, UT. Reside within approximately a 2-hour drive of Salt Lake City International Airport, or relocate within 2 months.",
    baseCity: "Salt Lake City",
    baseState: "UT",
    baseAirport: "SLC",
    aircraft: ["Challenger 350"],
    tailNumber: "N522AD",
    notes: "No Hawaii requirement on the SIC seat, unlike the Captain post.",
    minimumRequirements: [
      "Minimum 2,000 hours total flight time, including:",
      "  300 hours multi-engine",
      "  200 hours turbine",
      "  200 hours jet",
      "  200 hours instrument",
      "FAA Commercial or Airline Transport Pilot (ATP) Certificate with appropriate category and class",
      "Valid FAA 1st Class Medical Certificate",
      "FCC Restricted Radiotelephone Operator Permit",
      "FAA Instrument Rating",
      "Valid U.S. passport and driver's license",
      "Current IFR knowledge and experience",
      "Must be legally authorized to work in the United States without sponsorship"
    ].join("\n")
  },
  {
    requirementTitle: "Praetor 600 Captain",
    // 250+ PIC hours in the EMB-550 is "strongly preferred", NOT required, so it is
    // deliberately left out of the gates and recorded in the notes instead.
    hours: { total_time: 4500, pic_time: 3000, multi_engine_time: 1000, jet_time: 800, instrument_time: 300 },
    boolsOn: [...CERTS_STANDARD, "atp_certificate", "fluid_schedule", "slc_relocation", "international_required"],
    boolsOff: ["set_rotation", "part_135_required", "part_135_preferred"],
    pay: "$230,000 - $240,000 annually",
    rotation: MANAGED_ROTATION,
    scheduleRaw: "Dedicated aircraft position supporting a private owner. Fluid, based on owner travel needs, with 8 hard days off per month. Days, nights, weekdays, weekends and holidays; overnight trips away from home.",
    locationFit: "Based in the Salt Lake City, UT area. Reside within approximately a 2-hour drive of Salt Lake City International Airport, or relocate within 2 months.",
    // The post says Salt Lake City area. He said Ogden. Following the post, flagged
    // in the review file for him to settle.
    baseCity: "Salt Lake City",
    baseState: "UT",
    baseAirport: "SLC",
    aircraft: ["Praetor 600"],
    notes: "250+ PIC hours in the EMB-550 is strongly preferred, not required, so it is not a gate. Overseas international experience IS required. Aircraft not yet purchased, so no tail number.",
    minimumRequirements: [
      "Overseas international experience is required",
      "Minimum 4,500 hours total flight time, including:",
      "  3,000 hours PIC",
      "  1,000 hours multi-engine",
      "  800 hours jet",
      "  300 hours instrument",
      "  250+ PIC hours in the EMB-550 is strongly preferred",
      "FAA Commercial or Airline Transport Pilot (ATP) Certificate with appropriate category and class",
      "Valid FAA 1st Class Medical Certificate",
      "FCC Restricted Radiotelephone Operator Permit",
      "FAA Instrument Rating",
      "Valid U.S. passport and driver's license",
      "Current IFR knowledge and experience",
      "Must be legally authorized to work in the United States without sponsorship"
    ].join("\n")
  },
  {
    requirementTitle: "Praetor 600 First Officer",
    hours: { total_time: 2000, multi_engine_time: 300, turbine_time: 200, jet_time: 200, instrument_time: 200 },
    boolsOn: [...CERTS_STANDARD, "fluid_schedule", "slc_relocation"],
    // "Overseas international experience is preferred" - preferred, so not a gate.
    boolsOff: ["set_rotation", "atp_certificate", "part_135_required", "part_135_preferred", "international_required"],
    pay: "$130,000 - $140,000 annually",
    rotation: MANAGED_ROTATION,
    scheduleRaw: "Dedicated aircraft position supporting a private owner. Fluid, based on owner travel needs, with 8 hard days off per month. Days, nights, weekdays, weekends and holidays; overnight trips away from home.",
    locationFit: "Based in the Salt Lake City, UT area. Reside within approximately a 2-hour drive of Salt Lake City International Airport, or relocate within 2 months.",
    baseCity: "Salt Lake City",
    baseState: "UT",
    baseAirport: "SLC",
    aircraft: ["Praetor 600"],
    notes: "Overseas international experience is preferred, not required, so it is not a gate. Aircraft not yet purchased, so no tail number.",
    minimumRequirements: [
      "Overseas international experience is preferred",
      "Minimum 2,000 hours total flight time, including:",
      "  300 hours multi-engine",
      "  200 hours turbine",
      "  200 hours jet",
      "  200 hours instrument",
      "FAA Commercial or Airline Transport Pilot (ATP) Certificate with appropriate category and class",
      "Valid FAA 1st Class Medical Certificate",
      "FCC Restricted Radiotelephone Operator Permit",
      "FAA Instrument Rating",
      "Valid U.S. passport and driver's license",
      "Current IFR knowledge and experience",
      "Must be legally authorized to work in the United States without sponsorship"
    ].join("\n")
  },
  {
    requirementTitle: "Single-Pilot Jet Captain (Georgia)",
    hours: { total_time: 2800, pic_time: 250, multi_engine_time: 500, jet_time: 300, instrument_time: 200 },
    // "Recent single-pilot jet experience" is required but stated with no number, so
    // the gate is enabled without a threshold rather than invented.
    hoursNoValue: ["single_pilot_jet_time"],
    boolsOn: [...CERTS_STANDARD, "atp_certificate", "fluid_schedule", "part_135_preferred", "tsa_sida"],
    // Georgia, not Utah - the SLC relocation gate inherited from the template would
    // have been actively wrong here.
    boolsOff: ["set_rotation", "slc_relocation", "part_135_required", "international_required"],
    pay: "$160,000 - $180,000 annually, relocation assistance up to $10,000 may be available",
    rotation: MANAGED_ROTATION,
    scheduleRaw: "Dedicated aircraft position supporting a private owner. Fluid, based on the owner's travel needs, with 8 hard days off per month. The owner is known for respecting pilots' family time.",
    locationFit: "Based in Georgia at Covington Municipal Airport (CVC), with plans to move to Greene County Regional Airport (CPP). Reside within approximately a 2-hour drive of CVC/CPP.",
    baseCity: "Covington",
    baseState: "GA",
    baseAirport: "CVC",
    aircraft: ["Citation CJ"],
    // The post's internal block names the tail, and it is the SAME aircraft as the
    // retired SLC CJ Captain role: the aircraft moved to Georgia.
    tailNumber: "N443BC",
    notes: "Managed Part 91 Citation CJ, tail N443BC - the same aircraft as the former SLC CJ Captain role, which moved to Georgia. Recent single-pilot jet experience is required but the post states no hour figure, so that gate carries no threshold. Initially at CVC, moving to CPP.",
    minimumRequirements: [
      "Must have recent single-pilot jet experience",
      "Minimum 2,800 hours total flight time, including:",
      "  250 hours as PIC",
      "  500 hours of multi",
      "  300 hours of jet",
      "  200 hours of instrument",
      "FAA Commercial or Airline Transport Pilot (ATP) Certificate with appropriate category and class",
      "Valid FAA 1st Class Medical Certificate",
      "FCC Restricted Radiotelephone Operator Permit",
      "FAA Instrument Rating",
      "Valid U.S. passport and driver's license",
      "Current IFR knowledge and experience",
      "Prior Part 135 experience preferred",
      "Must be legally authorized to work in the United States without sponsorship",
      "Must be able to pass TSA background checks and secure an appropriate SIDA badge when applicable"
    ].join("\n")
  },
  {
    requirementTitle: "PC-12 First Officer",
    // Already correct - the post confirms 800 total / 50 instrument. Included so the
    // schedule, rotation, pay and location text land alongside the others.
    hours: { total_time: 800, instrument_time: 50 },
    boolsOn: [...CERTS_STANDARD.filter((key) => key !== "training_contract"), "training_contract", "set_rotation", "tsa_sida"],
    boolsOff: ["atp_certificate", "fluid_schedule", "slc_relocation", "international_required", "part_135_required"],
    pay: "$40,000 annually",
    rotation: "10/5",
    scheduleRaw: "10/5 rotation for PC-12 SICs. Flexible within the rotation, including days, nights, weekdays, weekends and holidays; overnight trips away from home.",
    locationFit: "Must reside within 1 hour of the Ogden, UT airport or commit to relocating within two months of hire. Commuting is not an option for this position.",
    baseCity: "Ogden",
    baseState: "UT",
    baseAirport: "OGD",
    aircraft: ["Pilatus PC-12"],
    notes: "800 hours total, or 700 if currently employed as an active CFI - the CFI allowance cannot be expressed as a gate and must be applied by hand. Part 135, SkyShare-operated, no tail.",
    minimumRequirements: [
      "FAA Commercial or Airline Transport Pilot (ATP) Certificate with single and multi-engine land ratings",
      "Minimum 800 hours total flight time, including:",
      "  50 hours instrument",
      "  700 hours total flight time if currently employed as an active CFI",
      "Valid FAA 1st Class Medical Certificate",
      "FCC Restricted Radiotelephone Operator Permit",
      "FAA Instrument Rating",
      "Valid U.S. passport and driver's license",
      "Must be legally authorized to work in the United States without sponsorship",
      "Must be able to pass TSA background checks and secure an appropriate SIDA badge when applicable"
    ].join("\n")
  }
];

type GateSnapshot = { id: string; enabled: boolean; numericValue: number | null };
type UndoRecord = {
  generatedAt: string;
  requirements: Array<{
    id: string;
    title: string;
    fields: Record<string, unknown>;
    gates: GateSnapshot[];
  }>;
  createdVariantIds: string[];
};

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  if (UNDO) return undo();

  const lines: string[] = [];
  const problems: string[] = [];
  lines.push(`APPLY JOB POST REQUIREMENTS - ${APPLY ? "APPLIED" : "DRY RUN, nothing written"}`);
  lines.push(`generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("Source: the four PDFs supplied 2026-08-28 (Challenger 350 PIC-SIC, Praetor 600");
  lines.push("PIC-SIC, Straight CJ PIC Georgia, PC-12 First Officer SIC).");
  lines.push("");

  const undoRecord: UndoRecord = { generatedAt: new Date().toISOString(), requirements: [], createdVariantIds: [] };

  for (const role of ROLES) {
    const requirement = await prisma.pilotRequirement.findFirst({
      where: { title: role.requirementTitle, status: "ACTIVE" },
      select: {
        id: true,
        title: true,
        payScaleRaw: true,
        rotation: true,
        scheduleRaw: true,
        locationFitRequirements: true,
        baseCity: true,
        baseState: true,
        baseAirport: true,
        aircraftTypesJson: true,
        manualOverrideNotes: true,
        rawMinimumRequirements: true,
        originalJobDescriptionText: true,
        managedVariants: { select: { tailNumber: true } },
        gates: { select: { id: true, key: true, enabled: true, numericValue: true, valueType: true } }
      }
    });
    if (!requirement) {
      problems.push(`ACTIVE requirement "${role.requirementTitle}" not found`);
      continue;
    }

    lines.push(`=== ${role.requirementTitle} ===`);

    // A requirement created with no gate template has no gate rows at all, so there
    // is nothing to update and every key below would be reported missing. Seed the
    // full catalog first, disabled, and let the spec switch on what the post names.
    let gateRows = requirement.gates;
    if (!gateRows.length) {
      const catalog = await prisma.requirementCatalogItem.findMany({
        where: { archivedAt: null },
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }]
      });
      lines.push(`   gates  none existed - seeding ${catalog.length} catalog gates (all off, then set from the post)`);
      if (APPLY) {
        await prisma.pilotRequirementGate.createMany({
          data: catalog.map((item, index) => ({
            pilotRequirementId: requirement.id,
            catalogItemId: item.id,
            key: item.key,
            label: item.label,
            category: item.category,
            valueType: item.valueType,
            enabled: false,
            sortOrder: index + 1
          }))
        });
        gateRows = await prisma.pilotRequirementGate.findMany({
          where: { pilotRequirementId: requirement.id },
          select: { id: true, key: true, enabled: true, numericValue: true, valueType: true }
        });
      } else {
        // Dry run: model what the seeded rows would look like so the diff below is
        // reportable without writing anything.
        gateRows = catalog.map((item) => ({ id: `(new:${item.key})`, key: item.key, enabled: false, numericValue: null, valueType: item.valueType }));
      }
    }

    const gatesByKey = new Map(gateRows.map((gate) => [gate.key, gate]));
    const gateSnapshots: GateSnapshot[] = [];
    const gateWrites: Array<{ id: string; enabled: boolean; numericValue: number | null }> = [];

    // Hour gates: the post is authoritative. Any hour gate not named is cleared, so
    // a stale inherited threshold cannot survive underneath the new ones.
    for (const gate of gateRows) {
      if (gate.valueType !== "hours") continue;
      const target = role.hours[gate.key];
      const noValue = role.hoursNoValue?.includes(gate.key) ?? false;
      const nextEnabled = target !== undefined || noValue;
      const nextValue = target !== undefined ? target : null;
      if (gate.enabled === nextEnabled && gate.numericValue === nextValue) continue;
      const before = gate.numericValue === null ? (gate.enabled ? "on/no value" : "off") : String(gate.numericValue);
      const after = nextEnabled ? (nextValue === null ? "on/no value" : String(nextValue)) : "off";
      lines.push(`   hours  ${gate.key.padEnd(24)} ${before.padStart(12)} -> ${after}`);
      gateSnapshots.push({ id: gate.id, enabled: gate.enabled, numericValue: gate.numericValue });
      gateWrites.push({ id: gate.id, enabled: nextEnabled, numericValue: nextValue });
    }
    for (const key of Object.keys(role.hours)) {
      if (!gatesByKey.has(key)) problems.push(`"${role.requirementTitle}": no gate row for hour key "${key}"`);
    }

    for (const key of role.boolsOn) {
      const gate = gatesByKey.get(key);
      if (!gate) {
        problems.push(`"${role.requirementTitle}": no gate row for boolean key "${key}"`);
        continue;
      }
      if (gate.enabled) continue;
      lines.push(`   bool   ${key.padEnd(24)}          off -> on`);
      gateSnapshots.push({ id: gate.id, enabled: gate.enabled, numericValue: gate.numericValue });
      gateWrites.push({ id: gate.id, enabled: true, numericValue: gate.numericValue });
    }
    for (const key of role.boolsOff) {
      const gate = gatesByKey.get(key);
      if (!gate || !gate.enabled) continue;
      lines.push(`   bool   ${key.padEnd(24)}           on -> off`);
      gateSnapshots.push({ id: gate.id, enabled: gate.enabled, numericValue: gate.numericValue });
      gateWrites.push({ id: gate.id, enabled: false, numericValue: gate.numericValue });
    }

    const fields = {
      payScaleRaw: role.pay,
      rotation: role.rotation,
      scheduleRaw: role.scheduleRaw,
      locationFitRequirements: role.locationFit,
      baseCity: role.baseCity,
      baseState: role.baseState,
      baseAirport: role.baseAirport,
      aircraftTypesJson: JSON.stringify(role.aircraft),
      manualOverrideNotes: role.notes,
      // Never shrink what is already there. PC-12 First Officer carries 2,100
      // characters of real imported posting text; replacing that with a shorter
      // hand transcription would lose detail to gain nothing.
      rawMinimumRequirements:
        (requirement.rawMinimumRequirements ?? "").length > role.minimumRequirements.length
          ? requirement.rawMinimumRequirements
          : role.minimumRequirements,
      originalJobDescriptionText:
        (requirement.originalJobDescriptionText ?? "").length > role.minimumRequirements.length
          ? requirement.originalJobDescriptionText
          : role.minimumRequirements,
      extractionWarningsJson: JSON.stringify(["Built from the job post PDF supplied 2026-08-28. Preferred-but-not-required items are recorded in the notes rather than gated."]),
      extractionConfidence: 95
    };
    if (requirement.baseAirport !== role.baseAirport || requirement.baseCity !== role.baseCity) {
      lines.push(`   base   ${[requirement.baseCity, requirement.baseAirport].filter(Boolean).join("/") || "none"} -> ${[role.baseCity, role.baseAirport].filter(Boolean).join("/")}`);
    }
    if (requirement.payScaleRaw !== role.pay) lines.push(`   pay    ${requirement.payScaleRaw ?? "none"} -> ${role.pay}`);
    if (!requirement.rotation) lines.push(`   rot    none -> ${role.rotation}`);
    const existingTextLength = (requirement.rawMinimumRequirements ?? "").length;
    lines.push(
      existingTextLength > role.minimumRequirements.length
        ? `   text   requirements ${existingTextLength} chars KEPT (already richer than the ${role.minimumRequirements.length}-char transcription)`
        : `   text   requirements ${existingTextLength} chars -> ${role.minimumRequirements.length} chars`
    );
    if (role.tailNumber && !requirement.managedVariants.some((variant) => variant.tailNumber === role.tailNumber)) {
      lines.push(`   tail   + ${role.tailNumber}`);
    }
    lines.push(`   note   ${role.notes}`);
    lines.push("");

    if (!APPLY) continue;

    undoRecord.requirements.push({
      id: requirement.id,
      title: requirement.title,
      fields: {
        payScaleRaw: requirement.payScaleRaw,
        rotation: requirement.rotation,
        scheduleRaw: requirement.scheduleRaw,
        locationFitRequirements: requirement.locationFitRequirements,
        baseCity: requirement.baseCity,
        baseState: requirement.baseState,
        baseAirport: requirement.baseAirport,
        aircraftTypesJson: requirement.aircraftTypesJson,
        manualOverrideNotes: requirement.manualOverrideNotes,
        rawMinimumRequirements: requirement.rawMinimumRequirements,
        originalJobDescriptionText: requirement.originalJobDescriptionText
      },
      gates: gateSnapshots
    });

    await prisma.pilotRequirement.update({ where: { id: requirement.id }, data: fields });
    for (const write of gateWrites) {
      await prisma.pilotRequirementGate.update({ where: { id: write.id }, data: { enabled: write.enabled, numericValue: write.numericValue } });
    }
    if (role.tailNumber && !requirement.managedVariants.some((variant) => variant.tailNumber === role.tailNumber)) {
      const variant = await prisma.managedVariant.create({
        data: {
          pilotRequirementId: requirement.id,
          tailNumber: role.tailNumber,
          baseCity: role.baseCity,
          baseState: role.baseState,
          status: "ACTIVE",
          notes: "From the job post supplied 2026-08-28"
        },
        select: { id: true }
      });
      undoRecord.createdVariantIds.push(variant.id);
    }
  }

  if (problems.length) {
    lines.push("*** PROBLEMS ***");
    for (const problem of problems) lines.push(`  ! ${problem}`);
    lines.push("");
  }
  lines.push("FLAGGED FOR HIM:");
  lines.push("  - Praetor 600: he said Ogden, both posts say the Salt Lake City area. Followed the posts.");
  lines.push("  - PC-12 First Officer pay is $40,000 in the post, well below the other seats. Taken as written.");
  lines.push("  - Challenger 350 Captain requires prior Hawaii experience; no catalog gate exists for it.");
  lines.push("  - PC-12 First Officer allows 700 hours for an active CFI; a gate cannot express that.");

  const report = lines.join("\n");
  writeFileSync(REVIEW_FILE, report, "utf8");
  console.log(report);
  console.log(`\nreview file: ${REVIEW_FILE}`);

  if (!APPLY) {
    console.log("\nDRY RUN - nothing was written. Re-run with --apply to write.");
    return;
  }
  writeFileSync(UNDO_FILE, JSON.stringify(undoRecord, null, 2), "utf8");
  console.log(`\nAPPLIED to ${undoRecord.requirements.length} requirements. undo record: ${UNDO_FILE}`);
}

async function undo() {
  if (!existsSync(UNDO_FILE)) {
    console.log(`No undo record at ${UNDO_FILE}`);
    return;
  }
  const record = JSON.parse(readFileSync(UNDO_FILE, "utf8")) as UndoRecord;
  for (const requirement of record.requirements) {
    await prisma.pilotRequirement.update({ where: { id: requirement.id }, data: requirement.fields });
    for (const gate of requirement.gates) {
      await prisma.pilotRequirementGate.update({ where: { id: gate.id }, data: { enabled: gate.enabled, numericValue: gate.numericValue } });
    }
  }
  await prisma.managedVariant.deleteMany({ where: { id: { in: record.createdVariantIds } } });
  console.log(`Reverted ${record.requirements.length} requirements and removed ${record.createdVariantIds.length} variants.`);
}

main().finally(() => prisma.$disconnect());
