// Full time or part time from Paycom's DOL_Status, into EmploymentTypePeriod - the
// records prisma/import-employment-types.ts loaded from the roster workbook, which stop
// at its Aug 13, 2024 list. Source: his Advanced Report Writer export of 2026-10-16
// (see prisma/paycom-employee-export.ts).
//
// Asked for 2026-09-29 ("full time vs part time vs contract vs anything else") and
// 2026-09-30 (the Paycom export). He: "this is all i can get you."
//
// WHAT PAYCOM'S VALUE MEANS: one type per person, undated - what they are today, or for
// somebody who left, what they were when they left. So each is ONE dated point (today,
// or their termination date) and is laid down exactly as the workbook loader lays its
// points: a type reaches back to the day after the last full staff list before it (the
// last one is Aug 13, 2024), never to the start of somebody's employment, and runs to
// the end of that employment (open while it is).
//   - No type on file there: a new period from that reach (or the start of employment,
//     or the day after the type before it, whichever is latest).
//   - The same type already on file: nothing.
//   - A different one: the change is taken to happen right after the last staff list
//     inside the old type's period - the old one ends on that list, the new starts the
//     day after. (The workbook loader's own rule for a change between two lists.)
//   - The workbook says Day rate / Temp / Leave and Paycom says Part time: left alone.
//     Paycom has only full and part, so its "Part time" is not news about a day rate.
// Contract stays ContractPeriod's, which the report already puts first.
//
//   npx tsx prisma/import-paycom-dol-status.ts <xlsx> --as-of 2026-10-16             dry run
//   npx tsx prisma/import-paycom-dol-status.ts <xlsx> --as-of 2026-10-16 --apply [--only "Name,Name"]
//   npx tsx prisma/import-paycom-dol-status.ts --undo <undo file>

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { applyDol, describeDol, loadEmployees, planDol, undoDol, DOL_SOURCE as SOURCE, type DolPlan, type DolUndo } from "@/lib/paycom/employee-plan";
import { readExport, matchPerson } from "./paycom-employee-export";

// The planning and writing now live in lib/paycom/employee-plan.ts, shared with the
// Imports -> Paycom employees upload; this script is the same run from a terminal.

const UNDO_DIR = path.join(process.cwd(), "scripts", "paycom-dol-status");

async function undo(file: string) {
  const rec = JSON.parse(fs.readFileSync(file, "utf8")) as DolUndo;
  await prisma.$transaction((tx) => undoDol(tx, rec));
  console.log(`undo: deleted up to ${rec.created.length} periods, reopened ${rec.closed.length}`);
}

async function main() {
  const undoIdx = process.argv.indexOf("--undo");
  if (undoIdx >= 0) return undo(process.argv[undoIdx + 1]);
  const file = process.argv[2];
  const asOfIdx = process.argv.indexOf("--as-of");
  if (!file || file.startsWith("--") || asOfIdx < 0) throw new Error("usage: <xlsx> --as-of YYYY-MM-DD [--apply] [--only \"Name,Name\"]");
  const asOf = Date.parse(`${process.argv[asOfIdx + 1]}T00:00:00Z`);
  if (Number.isNaN(asOf)) throw new Error("--as-of needs YYYY-MM-DD: the day the export was run");
  const apply = process.argv.includes("--apply");
  const onlyIdx = process.argv.indexOf("--only");
  const only = onlyIdx >= 0 ? new Set(process.argv[onlyIdx + 1].split(",").map((s) => s.trim())) : null;
  const note = `Paycom DOL status (export ${path.basename(file)})`;

  const rows = readExport(file);
  const people = await loadEmployees();
  const already = await prisma.employmentTypePeriod.count({ where: { source: SOURCE } });

  const plans: Array<{ name: string; id: string; plan: Extract<DolPlan, { kind: "change" }> }> = [];
  const forPerson: string[] = [];
  const tally: Record<string, number> = {};
  const bump = (k: string) => (tally[k] = (tally[k] ?? 0) + 1);
  for (const r of rows) {
    if (!r.dol) { bump("Paycom has no DOL status"); continue; }
    const p = matchPerson(r, people);
    if (!p) { bump("not matched to one person"); forPerson.push(`${r.label}: not matched to one person`); continue; }
    const plan = planDol(r, p, asOf);
    bump(plan.tally);
    if (plan.kind === "judgment") forPerson.push(`${p.name}: ${plan.why}`);
    if (plan.kind === "change") plans.push({ name: p.name, id: p.id, plan });
  }

  console.log(`export rows ${rows.length} | ${Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(" | ")}`);
  if (already) console.log(`NOTE: ${already} ${SOURCE} rows are already loaded`);
  for (const pl of plans) console.log(`  ${pl.name}: ${describeDol(pl.plan.change, pl.plan.at)}`);
  if (forPerson.length) console.log(`\nFOR A PERSON - not loaded:\n  ${forPerson.join("\n  ")}`);
  // Re-running is safe: the plan is made from what is on file, so a type already
  // loaded reads as "same type already on file" and is not loaded twice.
  if (!apply) { console.log("\nDRY RUN - nothing written."); return; }

  const todo = plans.filter((pl) => !only || only.has(pl.name));
  if (only && todo.length !== only.size) throw new Error(`--only named ${only.size} people, ${todo.length} of them have a change`);
  fs.mkdirSync(UNDO_DIR, { recursive: true });
  const undoFile = path.join(UNDO_DIR, `undo-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const rec = { loadedAt: new Date().toISOString(), source: SOURCE, created: [] as string[], closed: [] as DolUndo["closed"] };
  for (const pl of todo) {
    const u = await prisma.$transaction((tx) => applyDol(tx, pl.id, pl.plan, note));
    rec.created.push(...u.created);
    rec.closed.push(...u.closed);
    fs.writeFileSync(undoFile, JSON.stringify(rec, null, 1));
  }
  console.log(`\nLOADED ${todo.length}. Undo: npx tsx prisma/import-paycom-dol-status.ts --undo ${path.relative(process.cwd(), undoFile)}`);
}

main().finally(() => prisma.$disconnect());
