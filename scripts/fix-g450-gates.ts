/**
 * Correct the hour gates on the ACTIVE "G450 & GV Captain" requirement.
 *
 * WHY: the stored gates did not match the job posting, on a live role carrying 31
 * applications. Found 2026-08-30 by reading the posting text stored on the
 * requirement itself and comparing it against the gates:
 *
 *   total_time        4000 -> 5000   gate was too LOOSE: 4,000-4,999 hour pilots
 *                                    passed a minimum the posting does not grant
 *   jet_time          2000 -> 1500   gate was too STRICT: qualified pilots with
 *                                    1,500-1,999 jet hours were screened OUT
 *   time_in_type       250 -> 1000   wrong figure
 *   pic_time_in_type   off ->  250   the 250 belonged here, not on time_in_type
 *
 * pic_time (3000) and multi_engine_time (2000) were already right and are left
 * alone; they are listed in the plan so the review file shows the whole picture
 * rather than only the deltas.
 *
 * THE NUMBERS ARE THE USER'S, not the reader's. Supplied directly on 2026-08-30:
 * 5,000 total / 3,000 PIC / 2,000 multi / 1,500 jet / 1,000 in type / 250+ PIC in
 * type. Note this differs from a literal reading of the posting, which says
 * "1000 PIC hours in the G450/550 and/or GV" and so reads as PIC-in-type 1000.
 * The user's figures were used because the user sets the hiring bar; the posting
 * wording is worth revisiting separately.
 *
 *   npx tsx scripts/fix-g450-gates.ts            # dry run, writes the review file
 *   npx tsx scripts/fix-g450-gates.ts --apply    # writes, records the undo
 *   npx tsx scripts/fix-g450-gates.ts --undo     # restores from that record
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/client/client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const REQUIREMENT_TITLE = "G450 & GV Captain";

/** The intended end state. Every hour gate this role should carry, and its value. */
const TARGET: Array<{ key: string; value: number }> = [
  { key: "total_time", value: 5000 },
  { key: "pic_time", value: 3000 },
  { key: "multi_engine_time", value: 2000 },
  { key: "jet_time", value: 1500 },
  { key: "time_in_type", value: 1000 },
  { key: "pic_time_in_type", value: 250 }
];

const OUT_DIR = path.join(process.cwd(), "scripts", "g450-gate-fix");
const REVIEW_FILE = path.join(OUT_DIR, "review-g450-gates.txt");
const UNDO_FILE = path.join(OUT_DIR, "undo-g450-gates.json");

type UndoEntry = { gateId: string; key: string; enabledWas: boolean; numericValueWas: number | null };

async function loadGates() {
  const req = await prisma.pilotRequirement.findFirst({
    where: { title: REQUIREMENT_TITLE, status: "ACTIVE" },
    select: { id: true, title: true, status: true, operatorType: true }
  });
  if (!req) throw new Error(`No ACTIVE requirement titled "${REQUIREMENT_TITLE}"`);

  const gates = await prisma.pilotRequirementGate.findMany({
    where: { pilotRequirementId: req.id, valueType: "hours" },
    select: { id: true, key: true, label: true, enabled: true, numericValue: true },
    orderBy: { sortOrder: "asc" }
  });
  return { req, gates };
}

async function dryRun() {
  const { req, gates } = await loadGates();
  const lines: string[] = [];
  const say = (s = "") => {
    lines.push(s);
    console.log(s);
  };

  say("G450 & GV Captain — hour gate correction — DRY RUN, nothing was written");
  say("======================================================================");
  say("");
  say(`requirement ${req.id}  [${req.status}/${req.operatorType}]  "${req.title}"`);
  say("");

  const changes: Array<{ gateId: string; key: string; label: string; fromEnabled: boolean; fromValue: number | null; toValue: number }> = [];
  const unchanged: string[] = [];
  const missing: string[] = [];

  for (const t of TARGET) {
    const gate = gates.find((g) => g.key === t.key);
    if (!gate) {
      missing.push(t.key);
      continue;
    }
    if (gate.enabled && gate.numericValue === t.value) {
      unchanged.push(`  ${String(gate.numericValue).padStart(6)}  ${gate.label} — already correct`);
    } else {
      changes.push({ gateId: gate.id, key: gate.key, label: gate.label, fromEnabled: gate.enabled, fromValue: gate.numericValue, toValue: t.value });
    }
  }

  say(`WOULD CHANGE (${changes.length})`);
  if (!changes.length) say("  (none)");
  for (const c of changes) {
    const was = c.fromEnabled ? String(c.fromValue) : `off (${c.fromValue ?? "no value"})`;
    say(`  ${c.label}`);
    say(`    ${was}  ->  ${c.toValue}${c.fromEnabled ? "" : "  and switched ON"}`);
  }
  say("");

  say(`ALREADY CORRECT, left alone (${unchanged.length})`);
  if (!unchanged.length) say("  (none)");
  unchanged.forEach((u) => say(u));
  say("");

  say(`Target keys with no gate row: ${missing.length ? missing.join(", ") : "(none)"}`);
  say("");

  // Positive control — show every hour gate on the role, so an empty change list
  // above is readable as a real result rather than a query that matched nothing.
  say("POSITIVE CONTROL — every hour gate on this requirement, current state:");
  for (const g of gates) {
    say(`  ${g.enabled ? "ON " : "off"}  ${String(g.numericValue ?? "-").padStart(6)}  ${g.key}`);
  }
  say("");
  say("Nothing outside this one ACTIVE requirement is touched, and no boolean gate is touched.");
  say("Re-run with --apply to write these changes.");

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(REVIEW_FILE, lines.join("\n") + "\n", "utf8");
  console.log(`\nReview file written: ${path.relative(process.cwd(), REVIEW_FILE)}`);
  return { changes, missing };
}

async function apply() {
  const { changes, missing } = await dryRun();
  if (missing.length) {
    console.error(`\nAborted: no gate row for ${missing.join(", ")}. Nothing was written.`);
    process.exitCode = 1;
    return;
  }
  if (!changes.length) {
    console.log("\nNothing to apply.");
    return;
  }

  const { gates: before } = await loadGates();
  const undo: UndoEntry[] = changes.map((c) => {
    const g = before.find((b) => b.id === c.gateId)!;
    return { gateId: g.id, key: g.key, enabledWas: g.enabled, numericValueWas: g.numericValue };
  });

  for (const c of changes) {
    await prisma.pilotRequirementGate.update({
      where: { id: c.gateId },
      data: { enabled: true, numericValue: c.toValue }
    });
    console.log(`applied: ${c.label} -> ${c.toValue}`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(UNDO_FILE, JSON.stringify(undo, null, 2) + "\n", "utf8");
  console.log(`\nUndo record written: ${path.relative(process.cwd(), UNDO_FILE)}`);

  // Read back, so the result is observed rather than assumed from the write call.
  const { gates: after } = await loadGates();
  console.log("\nRead back from the database — every hour gate on this role:");
  for (const g of after) {
    if (g.enabled) console.log(`  ON   ${String(g.numericValue).padStart(6)}  ${g.label}`);
  }
}

async function undo() {
  if (!fs.existsSync(UNDO_FILE)) {
    console.error(`No undo record at ${path.relative(process.cwd(), UNDO_FILE)}`);
    process.exitCode = 1;
    return;
  }
  const entries = JSON.parse(fs.readFileSync(UNDO_FILE, "utf8")) as UndoEntry[];
  for (const e of entries) {
    await prisma.pilotRequirementGate.update({
      where: { id: e.gateId },
      data: { enabled: e.enabledWas, numericValue: e.numericValueWas }
    });
    console.log(`reverted: ${e.key} -> ${e.enabledWas ? e.numericValueWas : "off"}`);
  }
  console.log(`\nReverted ${entries.length} gate(s).`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--undo")) return undo();
  if (args.includes("--apply")) return apply();
  await dryRun();
}

main().finally(() => prisma.$disconnect());
