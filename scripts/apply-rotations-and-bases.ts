/**
 * Set the crew rotation on every pilot requirement, and correct the Praetor 600 base.
 *
 * ROTATION IS POLICY, NOT PER-POSTING. He gave the rule directly:
 *
 *   SkyShare pilots  - 15/13, 8/6 or 10/5 depending on aircraft type and seat
 *   Managed pilots   - as needed, with 8 hard days off per month
 *
 * and then the per-aircraft breakdown recorded in SKYSHARE_ROTATIONS below. Because
 * it is policy it is applied to EVERY requirement, not only the nine currently
 * active ones: an inactive role is the thing most likely to be switched back on in a
 * hurry, and it should come back with its rotation already correct rather than blank.
 *
 * Rotation drives schedule fit in matching, so a blank one is not neutral - it means
 * the role cannot be assessed on schedule at all.
 *
 * The seat and aircraft come from the fleet registry resolver rather than from string
 * matching on the title, so "Citation CE-525 (CJ2) Captain" and "CJ2 Captain" land on
 * the same rule. Anything the resolver cannot place is reported, never guessed.
 *
 * BASE FIX: the Praetor posts say "the Salt Lake City, UT area" and I followed them;
 * he has since confirmed the aircraft is Ogden-based. Both Praetor roles move to OGD.
 *
 *   npx tsx scripts/apply-rotations-and-bases.ts            # dry run
 *   npx tsx scripts/apply-rotations-and-bases.ts --apply
 *   npx tsx scripts/apply-rotations-and-bases.ts --undo
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/client/client";
import { positionFor } from "../lib/fleet/positions";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const APPLY = process.argv.includes("--apply");
const UNDO = process.argv.includes("--undo");
const OUT_DIR = join(process.cwd(), "scripts", "_reconcile_output");
const UNDO_FILE = join(OUT_DIR, "undo-rotations-and-bases.json");
const REVIEW_FILE = join(OUT_DIR, "review-rotations-and-bases.txt");

const MANAGED_ROTATION = "As needed, 8 hard days off per month";

/** aircraft (as named in the fleet registry) -> rotation by seat. */
const SKYSHARE_ROTATIONS: Record<string, { PIC: string; SIC: string }> = {
  "Gulfstream G450 & GV": { PIC: "15/13", SIC: "15/13" },
  "Gulfstream G200": { PIC: "8/6", SIC: "8/6" },
  "Citation 560XL": { PIC: "8/6", SIC: "8/6" },
  "Citation CJ2": { PIC: "8/6", SIC: "10/5" },
  "Pilatus PC-12": { PIC: "8/6", SIC: "10/5" },
  // The NG and NGX are the same airframe family for crewing purposes; the registry
  // keeps them as separate positions, so they are listed rather than inferred.
  "Pilatus PC-12 NG": { PIC: "8/6", SIC: "10/5" },
  "Pilatus PC-12 NGX": { PIC: "8/6", SIC: "10/5" }
};

/**
 * Rows the registry resolver cannot place, but whose rotation is not in doubt.
 * Evergreen PDP is the PC-12 SIC pipeline, so it takes the PC-12 SIC rotation.
 */
const TITLE_OVERRIDES: Record<string, string> = {
  "Evergreen PDP": "10/5"
};

/** Titles that are not flying seats at all and must not get a rotation. */
const NOT_A_FLYING_SEAT = ["G450 Aircraft Maintenance Technician"];

const BASE_FIXES: Array<{ title: string; city: string; state: string; airport: string; locationFit: string; why: string }> = [
  {
    title: "Praetor 600 Captain",
    city: "Ogden",
    state: "UT",
    airport: "OGD",
    locationFit: "Based in Ogden, UT. Reside within approximately a 2-hour drive of the Ogden base, or relocate within 2 months.",
    why: "post said the Salt Lake City area; he confirmed Ogden"
  },
  {
    title: "Praetor 600 First Officer",
    city: "Ogden",
    state: "UT",
    airport: "OGD",
    locationFit: "Based in Ogden, UT. Reside within approximately a 2-hour drive of the Ogden base, or relocate within 2 months.",
    why: "post said the Salt Lake City area; he confirmed Ogden"
  }
];

type UndoRecord = {
  generatedAt: string;
  rotations: Array<{ id: string; title: string; rotation: string | null }>;
  bases: Array<{ id: string; title: string; baseCity: string | null; baseState: string | null; baseAirport: string | null; locationFitRequirements: string | null }>;
};

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  if (UNDO) return undo();

  const lines: string[] = [];
  const unresolved: string[] = [];
  lines.push(`APPLY ROTATIONS AND BASES - ${APPLY ? "APPLIED" : "DRY RUN, nothing written"}`);
  lines.push(`generated: ${new Date().toISOString()}`);
  lines.push("");

  const undoRecord: UndoRecord = { generatedAt: new Date().toISOString(), rotations: [], bases: [] };

  // --- rotations, across every requirement regardless of status -----------------
  const requirements = await prisma.pilotRequirement.findMany({
    select: { id: true, title: true, status: true, operatorType: true, pilotSeat: true, fleetPositionSlug: true, rotation: true },
    orderBy: [{ status: "asc" }, { title: "asc" }]
  });

  lines.push(`--- rotations (${requirements.length} requirements, every status) ---`);
  let changed = 0;
  let alreadyRight = 0;

  for (const requirement of requirements) {
    if (NOT_A_FLYING_SEAT.includes(requirement.title)) {
      lines.push(`  SKIP  ${requirement.title.padEnd(48)} not a flying seat`);
      continue;
    }

    let rotation: string | null = null;
    let basis = "";

    if (requirement.operatorType === "Managed") {
      rotation = MANAGED_ROTATION;
      basis = "managed";
    } else if (TITLE_OVERRIDES[requirement.title]) {
      rotation = TITLE_OVERRIDES[requirement.title];
      basis = "title override";
    } else {
      const position = positionFor(requirement.fleetPositionSlug, requirement.title);
      if (!position) {
        unresolved.push(`${requirement.title} [${requirement.status}/${requirement.operatorType ?? "no operator"}] - fleet position could not be resolved`);
        continue;
      }
      const rule = SKYSHARE_ROTATIONS[position.aircraft];
      if (!rule) {
        unresolved.push(`${requirement.title} [${requirement.status}] - no rotation rule given for aircraft "${position.aircraft}"`);
        continue;
      }
      rotation = rule[position.seat];
      basis = `SkyShare ${position.aircraft} ${position.seat}`;
    }

    if (requirement.rotation === rotation) {
      alreadyRight += 1;
      continue;
    }
    lines.push(`  ${requirement.title.padEnd(48)} ${(requirement.rotation ?? "none").padEnd(36)} -> ${rotation}   [${basis}]`);
    changed += 1;
    if (!APPLY) continue;
    undoRecord.rotations.push({ id: requirement.id, title: requirement.title, rotation: requirement.rotation });
    await prisma.pilotRequirement.update({ where: { id: requirement.id }, data: { rotation } });
  }
  lines.push("");
  lines.push(`  ${changed} changed, ${alreadyRight} already correct, ${unresolved.length} not set`);
  lines.push("");

  if (unresolved.length) {
    lines.push("--- no rotation applied, needs a rule from him ---");
    for (const row of unresolved) lines.push(`  ? ${row}`);
    lines.push("");
  }

  // --- base corrections ---------------------------------------------------------
  lines.push("--- base corrections ---");
  for (const fix of BASE_FIXES) {
    const requirement = await prisma.pilotRequirement.findFirst({
      where: { title: fix.title },
      select: { id: true, title: true, baseCity: true, baseState: true, baseAirport: true, locationFitRequirements: true }
    });
    if (!requirement) {
      lines.push(`  SKIP  ${fix.title} - not found`);
      continue;
    }
    lines.push(`  ${fix.title.padEnd(30)} ${[requirement.baseCity, requirement.baseAirport].filter(Boolean).join("/") || "none"} -> ${fix.city}/${fix.airport}   [${fix.why}]`);
    if (!APPLY) continue;
    undoRecord.bases.push({
      id: requirement.id,
      title: requirement.title,
      baseCity: requirement.baseCity,
      baseState: requirement.baseState,
      baseAirport: requirement.baseAirport,
      locationFitRequirements: requirement.locationFitRequirements
    });
    await prisma.pilotRequirement.update({
      where: { id: requirement.id },
      data: { baseCity: fix.city, baseState: fix.state, baseAirport: fix.airport, locationFitRequirements: fix.locationFit }
    });
  }
  lines.push("");
  lines.push("NOTE: the SLC relocation gate stays ON for both Praetor roles - Ogden is inside");
  lines.push("the Wasatch Front commute the gate describes, and turning it off would stop");
  lines.push("flagging candidates who would need to move to Utah at all.");

  const report = lines.join("\n");
  writeFileSync(REVIEW_FILE, report, "utf8");
  console.log(report);
  console.log(`\nreview file: ${REVIEW_FILE}`);

  if (!APPLY) {
    console.log("\nDRY RUN - nothing was written. Re-run with --apply to write.");
    return;
  }
  writeFileSync(UNDO_FILE, JSON.stringify(undoRecord, null, 2), "utf8");
  console.log(`\nAPPLIED ${undoRecord.rotations.length} rotations and ${undoRecord.bases.length} base corrections.`);
  console.log(`undo record: ${UNDO_FILE}`);
}

async function undo() {
  if (!existsSync(UNDO_FILE)) {
    console.log(`No undo record at ${UNDO_FILE}`);
    return;
  }
  const record = JSON.parse(readFileSync(UNDO_FILE, "utf8")) as UndoRecord;
  for (const row of record.rotations) {
    await prisma.pilotRequirement.update({ where: { id: row.id }, data: { rotation: row.rotation } });
  }
  for (const row of record.bases) {
    await prisma.pilotRequirement.update({
      where: { id: row.id },
      data: {
        baseCity: row.baseCity,
        baseState: row.baseState,
        baseAirport: row.baseAirport,
        locationFitRequirements: row.locationFitRequirements
      }
    });
  }
  console.log(`Reverted ${record.rotations.length} rotations and ${record.bases.length} base corrections.`);
}

main().finally(() => prisma.$disconnect());
