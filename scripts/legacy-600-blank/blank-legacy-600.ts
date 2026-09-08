/**
 * Removes the Legacy 600 from the three employee records that carry it. There is
 * no Legacy 600 in this fleet; the aircraft was wrong at source on terminated
 * pilots, and his instruction on 2026-09-08 was to leave them blank, with the
 * titles set to "Pilot" where the schema will not accept a blank.
 *
 * WHAT IT DOES, and why the two field classes differ:
 *   NewHire.position        "Legacy 600 Pilot"/"...Captain" -> "Pilot"
 *   RoleAssignment.title    same                             -> "Pilot"
 *       Both are TITLES that happen to contain an aircraft name, and
 *       RoleAssignment.title is String (NOT NULL) so it cannot be blanked at all.
 *   RoleAssignment.aircraft "Legacy 600"                     -> null
 *       This is the only pure AIRCRAFT field, so this is the one that goes blank.
 *
 * Mark Killpack's role assignment keeps seat="PIC", so the fact that he was a
 * captain survives the title change in the field that actually encodes it.
 *
 * DRY RUN BY DEFAULT. Writes a review file either way.
 *   npx tsx scripts/legacy-600-blank/blank-legacy-600.ts            # dry run
 *   npx tsx scripts/legacy-600-blank/blank-legacy-600.ts --apply    # write
 *   npx tsx scripts/legacy-600-blank/blank-legacy-600.ts --undo     # reverse
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";

// Built from cwd, never __dirname: under tsx, __dirname resolves into
// prisma/generated/client, which is gitignored, and an undo record that lands
// there cannot be committed.
const DIR = join(process.cwd(), "scripts", "legacy-600-blank");
const UNDO = join(DIR, "UNDO.json");
const REVIEW = join(DIR, "review.txt");

const NEW_TITLE = "Pilot";
const is600 = (s: string | null | undefined) => !!s && /legacy\s*600/i.test(s);

type UndoRec = {
  appliedAt: string;
  newHirePositions: { id: string; name: string; from: string | null }[];
  roleTitles: { id: string; name: string; from: string }[];
  roleAircraft: { id: string; name: string; from: string | null }[];
};

async function collect() {
  const L = { contains: "Legacy", mode: "insensitive" } as const;
  const hires = await prisma.newHire.findMany({
    where: { OR: [{ position: L }, { managedAircraft: L }] },
    select: { id: true, name: true, position: true, managedAircraft: true },
  });
  const roles = await prisma.roleAssignment.findMany({
    where: { OR: [{ title: L }, { aircraft: L }] },
    select: {
      id: true, title: true, aircraft: true, seat: true,
      newHire: { select: { name: true } },
    },
  });
  return {
    hires: hires.filter((h) => is600(h.position)),
    roleTitles: roles.filter((r) => is600(r.title)),
    roleAircraft: roles.filter((r) => is600(r.aircraft)),
    allHires: hires,
    allRoles: roles,
  };
}

async function main() {
  const mode = process.argv.includes("--undo") ? "undo"
    : process.argv.includes("--apply") ? "apply" : "dry";
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  console.log("mode: " + mode);
  console.log("undo record path: " + UNDO);

  if (mode === "undo") {
    if (!existsSync(UNDO)) throw new Error("no undo record at " + UNDO);
    const u: UndoRec = JSON.parse(readFileSync(UNDO, "utf8"));
    console.log("reversing the pass applied at " + u.appliedAt);
    for (const r of u.newHirePositions) {
      await prisma.newHire.update({ where: { id: r.id }, data: { position: r.from } });
      console.log("  NewHire " + r.name + ".position restored to " + JSON.stringify(r.from));
    }
    for (const r of u.roleTitles) {
      await prisma.roleAssignment.update({ where: { id: r.id }, data: { title: r.from } });
      console.log("  RoleAssignment " + r.name + ".title restored to " + JSON.stringify(r.from));
    }
    for (const r of u.roleAircraft) {
      await prisma.roleAssignment.update({ where: { id: r.id }, data: { aircraft: r.from } });
      console.log("  RoleAssignment " + r.name + ".aircraft restored to " + JSON.stringify(r.from));
    }
    console.log("undo complete");
    return;
  }

  const c = await collect();
  const lines: string[] = [];
  const say = (s: string) => { lines.push(s); console.log(s); };

  say("=== SCOPE CONTROL: every row mentioning Legacy at all ===");
  say("NewHire rows: " + c.allHires.length + "   RoleAssignment rows: " + c.allRoles.length);
  for (const h of c.allHires) say("  NewHire        " + h.name.padEnd(20) + " position=" + JSON.stringify(h.position));
  for (const r of c.allRoles) say("  RoleAssignment " + r.newHire.name.padEnd(20) + " title=" + JSON.stringify(r.title) + " aircraft=" + JSON.stringify(r.aircraft) + " seat=" + JSON.stringify(r.seat));

  say("");
  say("=== CHANGES THIS PASS WOULD MAKE (" + (c.hires.length + c.roleTitles.length + c.roleAircraft.length) + " fields) ===");
  for (const h of c.hires) say("  NewHire." + h.id + ".position  " + JSON.stringify(h.position) + " -> " + JSON.stringify(NEW_TITLE) + "   (" + h.name + ")");
  for (const r of c.roleTitles) say("  RoleAssignment." + r.id + ".title  " + JSON.stringify(r.title) + " -> " + JSON.stringify(NEW_TITLE) + "   (" + r.newHire.name + ", seat " + JSON.stringify(r.seat) + " kept)");
  for (const r of c.roleAircraft) say("  RoleAssignment." + r.id + ".aircraft  " + JSON.stringify(r.aircraft) + " -> null   (" + r.newHire.name + ")");

  say("");
  say("=== UNTOUCHED (the positive control: real Legacy 650 rows) ===");
  for (const r of c.allRoles.filter((r) => !is600(r.title) && !is600(r.aircraft))) {
    say("  " + r.newHire.name.padEnd(20) + " title=" + JSON.stringify(r.title) + " aircraft=" + JSON.stringify(r.aircraft));
  }

  writeFileSync(REVIEW, lines.join("\n") + "\n");
  say("");
  say("review file written: " + REVIEW);

  if (mode === "dry") {
    say("DRY RUN - nothing written. Re-run with --apply to write.");
    return;
  }

  const undo: UndoRec = {
    appliedAt: new Date().toISOString(),
    newHirePositions: c.hires.map((h) => ({ id: h.id, name: h.name, from: h.position })),
    roleTitles: c.roleTitles.map((r) => ({ id: r.id, name: r.newHire.name, from: r.title })),
    roleAircraft: c.roleAircraft.map((r) => ({ id: r.id, name: r.newHire.name, from: r.aircraft })),
  };
  // Undo record is written BEFORE the writes, so a crash mid-pass still leaves
  // a way back rather than a half-changed database with no record of before.
  writeFileSync(UNDO, JSON.stringify(undo, null, 2));
  say("undo record written BEFORE writing: " + UNDO);

  for (const h of c.hires) await prisma.newHire.update({ where: { id: h.id }, data: { position: NEW_TITLE } });
  for (const r of c.roleTitles) await prisma.roleAssignment.update({ where: { id: r.id }, data: { title: NEW_TITLE } });
  for (const r of c.roleAircraft) await prisma.roleAssignment.update({ where: { id: r.id }, data: { aircraft: null } });
  say("applied.");

  const after = await collect();
  say("");
  say("=== VERIFY AFTER: rows still carrying a Legacy 600 (expect 0/0/0) ===");
  say("  NewHire.position " + after.hires.length + "   RoleAssignment.title " + after.roleTitles.length + "   RoleAssignment.aircraft " + after.roleAircraft.length);
  say("=== and the 650 rows are still there (expect 2) ===");
  say("  " + after.allRoles.filter((r) => !is600(r.title) && !is600(r.aircraft)).length);
  writeFileSync(REVIEW, lines.join("\n") + "\n");
}

main().finally(() => prisma.$disconnect());
