// Bring the app's employment dates in line with Paycom's, from either of his exports
// (see prisma/paycom-employee-export.ts): the Employee Dates report of 2026-10-15 and
// the Advanced Report Writer export of 2026-10-16 (everybody on Paycom since late 2021).
//
// Asked for 2026-09-30 ("the Paycom employee export - hire date, termination date,
// full/part time"). Full/part time is loaded separately: prisma/import-paycom-dol-status.ts.
//
// Paycom is the authority on these dates, but the app also holds history from before
// Paycom (the year-end lists, back to 2010), so a date is only CORRECTED where the two
// clearly describe the same stretch of employment:
//   - a start within 60 days of Paycom's hire / re-hire date, or a Jan 1 placeholder in
//     the same year (the year-end lists only say "employed by Dec 31");
//   - an end within 60 days of Paycom's termination date, or a Dec 31 placeholder in
//     that year or the one before;
//   - Paycom shows a termination and the app still has them working: done exactly as
//     the profile's own "terminated" control does it (app/api/new-hires/[id]/route.ts) -
//     status TERMINATED, stage ARCHIVED, the date, the open role and stint closed on it;
//   - Paycom shows a leave-and-return the app runs straight through: split in two.
// Anything else - a start years apart, a return the app has and Paycom does not,
// somebody the app calls a contractor - is listed for a person and NOT changed.
// Absence from an export is never evidence that somebody left.
// Not loaded on purpose: birth dates (not asked for), EE codes (no field, no use yet).
//
//   npx tsx prisma/import-paycom-employee-dates.ts <xlsx>                     dry run
//   npx tsx prisma/import-paycom-employee-dates.ts <xlsx> --apply [--only "Brock Tyler,Shad Guffey"]
//   npx tsx prisma/import-paycom-employee-dates.ts --undo <undo file>

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { applyDates, loadEmployees, planDates, undoDates, type DatesUndo, type Employee } from "@/lib/paycom/employee-plan";
import { readExport, matchPerson, type ExportRow } from "./paycom-employee-export";

// The planning and writing now live in lib/paycom/employee-plan.ts, shared with the
// Imports -> Paycom employees upload; this script is the same run from a terminal.

const UNDO_DIR = path.join(process.cwd(), "scripts", "paycom-employee-dates");

type Person = Employee;
type UndoEntry = DatesUndo & { id: string; name: string };

/** The first run's record (2026-10-16T15-38-54) listed only the stints it replaced
    and the open ones it closed. */
type FirstRunEntry = {
  id: string; name: string; before: UndoEntry["before"];
  deletedStints: UndoEntry["oldStints"]; createdStintIds: string[];
  closedRoles: Array<{ id: string; endDate: string | null }>; closedStintIds: string[];
};

async function undo(file: string) {
  const rec = JSON.parse(fs.readFileSync(file, "utf8")) as { people: Array<UndoEntry | FirstRunEntry> };
  for (const u of rec.people) {
    if ("deletedStints" in u) {
      await prisma.$transaction(async (tx) => {
        await tx.employmentStint.deleteMany({ where: { id: { in: u.createdStintIds } } });
        for (const s of u.deletedStints) await tx.employmentStint.create({ data: { id: s.id, newHireId: u.id, startDate: new Date(s.startDate), endDate: s.endDate ? new Date(s.endDate) : null, note: s.note } });
        await tx.employmentStint.updateMany({ where: { id: { in: u.closedStintIds } }, data: { endDate: null } });
        for (const r of u.closedRoles) await tx.roleAssignment.update({ where: { id: r.id }, data: { endDate: r.endDate ? new Date(r.endDate) : null } });
        await tx.newHire.update({ where: { id: u.id }, data: { employmentStatus: u.before.employmentStatus, stage: u.before.stage, terminationDate: u.before.terminationDate ? new Date(u.before.terminationDate) : null } });
      });
      console.log(`undone: ${u.name}`);
      continue;
    }
    await prisma.$transaction((tx) => undoDates(tx, u.id, u));
    console.log(`undone: ${u.name}`);
  }
  console.log(`undo: restored ${rec.people.length} people from ${file}`);
}

async function main() {
  const undoIdx = process.argv.indexOf("--undo");
  if (undoIdx >= 0) return undo(process.argv[undoIdx + 1]);

  const file = process.argv[2];
  if (!file || file.startsWith("--")) throw new Error("usage: <xlsx> [--apply] [--only \"Name,Name\"]");
  const note = `Paycom export ${path.basename(file)}`;
  const apply = process.argv.includes("--apply");
  const onlyIdx = process.argv.indexOf("--only");
  const only = onlyIdx >= 0 ? new Set(process.argv[onlyIdx + 1].split(",").map((s) => s.trim())) : null;

  const rows = readExport(file);
  const people = await loadEmployees();
  const changes: Array<{ r: ExportRow; p: Person; plan: Extract<ReturnType<typeof planDates>, { kind: "change" }> }> = [];
  const judgment: string[] = [];
  const unmatched: ExportRow[] = [];
  let agree = 0;
  for (const r of rows) {
    const p = matchPerson(r, people);
    if (!p) { unmatched.push(r); continue; }
    const plan = planDates(r, p, note);
    if (plan.kind === "agree") agree++;
    else if (plan.kind === "judgment") judgment.push(`${p.name} (Paycom ${r.label}: hire ${r.hire}${r.rehire ? `, left ${r.prevTerm}, back ${r.rehire}` : ""}${r.term ? `, left ${r.term}` : ""}) - ${plan.why}`);
    else changes.push({ r, p, plan });
  }

  console.log(`export rows ${rows.length} | agree ${agree} | to change ${changes.length} | for a person ${judgment.length} | not matched ${unmatched.length}`);
  for (const { r, p, plan } of changes) {
    console.log(`\n${p.name}  [Paycom ${r.label}: hire ${r.hire}${r.rehire ? `, left ${r.prevTerm}, back ${r.rehire}` : ""}${r.term ? `, left ${r.term}` : ""}]`);
    console.log(`   ${plan.what.join("; ")}  =>  ${plan.spans.map((s) => `${s.start}..${s.end ?? "open"}`).join(", ")}`);
  }
  if (judgment.length) console.log(`\nFOR A PERSON - not changed:\n  ${judgment.join("\n  ")}`);
  if (unmatched.length) console.log(`\nNOT MATCHED to one person - not changed:\n  ${unmatched.map((r) => `${r.label} | ${r.position} | hire ${r.hire}${r.term ? ` left ${r.term}` : ""}`).join("\n  ")}`);

  if (!apply) { console.log("\nDRY RUN - nothing written. Add --apply (and --only \"Name,Name\" for a small batch)."); return; }

  const todo = changes.filter((c) => !only || only.has(c.p.name));
  if (only && todo.length !== only.size) throw new Error(`--only named ${only.size} people, ${todo.length} of them need a change`);
  fs.mkdirSync(UNDO_DIR, { recursive: true });
  const undoFile = path.join(UNDO_DIR, `undo-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const record = { loadedAt: new Date().toISOString(), source: note, people: [] as UndoEntry[] };
  for (const { p, plan } of todo) {
    // A re-hire through this script starts with no current role: the upload asks for
    // one, a terminal run leaves it to the profile.
    const entry: UndoEntry = { id: p.id, name: p.name, ...(await prisma.$transaction((tx) => applyDates(tx, p, plan))) };
    record.people.push(entry);
    fs.writeFileSync(undoFile, JSON.stringify(record, null, 1)); // after every person, so a crash still leaves a usable undo
    console.log(`applied: ${p.name}`);
  }
  console.log(`\nLOADED ${todo.length}. Undo: npx tsx prisma/import-paycom-employee-dates.ts --undo ${path.relative(process.cwd(), undoFile)}`);
}

main().finally(() => prisma.$disconnect());
