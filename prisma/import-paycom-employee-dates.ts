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
import { periodsOf } from "@/lib/data/headcount-history";
import { readExport, matchPerson, type ExportRow } from "./paycom-employee-export";

const UNDO_DIR = path.join(process.cwd(), "scripts", "paycom-employee-dates");
const DAY = 86_400_000;
const CLOSE_DAYS = 60;

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const date = (s: string) => new Date(`${s}T00:00:00.000Z`);
const apart = (a: string, b: string) => Math.abs(date(a).getTime() - date(b).getTime()) / DAY;
/** May the app's date be replaced with Paycom's? */
const closeStart = (app: string, pay: string) => apart(app, pay) <= CLOSE_DAYS || (app.endsWith("-01-01") && app.slice(0, 4) === pay.slice(0, 4));
// A Dec 31 end is the last year-end list that showed them: Paycom's date that year, or
// the next (still there at year end, gone before the next list), replaces it.
const closeEnd = (app: string, pay: string) =>
  apart(app, pay) <= CLOSE_DAYS || (app.endsWith("-12-31") && (app.slice(0, 4) === pay.slice(0, 4) || Number(pay.slice(0, 4)) === Number(app.slice(0, 4)) + 1));

// Dates a person has already settled against Paycom's on purpose. The first run of
// 2026-10-16 moved Larry Uzelac back to May 15 and was reversed the same day.
const SETTLED: Record<string, string> = {
  "Larry Uzelac": "the Sep 29 merge kept him on staff to Dec 31 2022: the Jul and Sep 2022 staff lists still show him after Paycom's May 15, probably flying on contract",
  // He, 2026-10-16: "he left in june 2022 but came back before oct of 2022." Paycom
  // never recorded the return; the app's Aug 1, 2022 is right.
  "Robbie Allen": "he confirmed the app is right: left Jun 2022, came back before Oct 2022, still here; Paycom has no re-hire"
};

type Person = Awaited<ReturnType<typeof loadPeople>>[number];
type Span = { start: string; end: string | null; note: string | null };

const loadPeople = () =>
  prisma.newHire.findMany({
    where: { canceled: false },
    select: {
      id: true, name: true, legalName: true, startDate: true, terminationDate: true, employmentStatus: true, stage: true,
      employmentStints: { select: { id: true, startDate: true, endDate: true, note: true }, orderBy: { startDate: "asc" } },
      roleAssignments: { select: { id: true, title: true, startDate: true, endDate: true } }
    }
  });

type Plan =
  | { kind: "agree" }
  | { kind: "judgment"; why: string }
  | { kind: "change"; spans: Span[]; terminate: string | null; newEnd: string | null; oldEnd: string | null; what: string[] };

function planFor(r: ExportRow, p: Person, note: string): Plan {
  if (SETTLED[p.name]) return { kind: "judgment", why: `settled already - ${SETTLED[p.name]}` };
  if (p.employmentStatus === "CONTRACT") return { kind: "judgment", why: "the app has them as a contractor today" };
  const from = p.employmentStints.length
    ? p.employmentStints.map((s) => ({ start: iso(s.startDate)!, end: iso(s.endDate), note: s.note }))
    : periodsOf(p).map((x) => ({ start: iso(x.start)!, end: iso(x.end), note: null as string | null }));
  const spans: Span[] = from.sort((a, b) => a.start.localeCompare(b.start)).map((s) => ({ ...s }));
  if (!spans.length) return { kind: "judgment", why: "no dates in the app at all" };
  const oldEnd = iso(p.terminationDate) ?? from[from.length - 1].end;
  const want = r.rehire ? [{ start: r.hire, end: r.prevTerm }, { start: r.rehire, end: r.term }] : [{ start: r.hire, end: r.term }];
  if (r.rehire && !r.prevTerm) return { kind: "judgment", why: "Paycom has a re-hire with no earlier termination date" };
  const what: string[] = [];

  // A leave-and-return Paycom has and the app runs straight through.
  const last = spans[spans.length - 1];
  if (r.rehire && r.prevTerm && !spans.some((s) => closeStart(s.start, r.rehire!)) && closeStart(last.start, r.hire) && last.start <= r.prevTerm) {
    spans.splice(spans.length - 1, 1, { start: last.start, end: r.prevTerm, note }, { start: r.rehire, end: last.end, note });
    what.push(`split at Paycom's break ${r.prevTerm} to ${r.rehire}`);
  }
  if (spans.length < want.length) return { kind: "judgment", why: "Paycom has more employment periods than the app" };

  let terminate: string | null = null;
  const tail = spans.slice(-want.length);
  for (let i = 0; i < want.length; i++) {
    const s = tail[i], w = want[i], isLast = i === want.length - 1;
    if (s.start !== w.start) {
      if (!closeStart(s.start, w.start)) return { kind: "judgment", why: `starts ${s.start} in the app, ${w.start} in Paycom` };
      what.push(`start ${s.start} -> ${w.start}`); s.start = w.start; s.note = note;
    }
    if (s.end === w.end) continue;
    if (!w.end) return { kind: "judgment", why: `the app has them leaving ${s.end}, Paycom has them still working` };
    if (!s.end) {
      if (!isLast || p.employmentStatus !== "ACTIVE") return { kind: "judgment", why: `Paycom has them leaving ${w.end}, the app has an open period` };
      terminate = w.end; what.push(`left ${w.end} (still working in the app)`);
    } else {
      if (!closeEnd(s.end, w.end)) return { kind: "judgment", why: `leaves ${s.end} in the app, ${w.end} in Paycom` };
      what.push(`end ${s.end} -> ${w.end}`);
    }
    s.end = w.end; s.note = note;
  }
  for (let i = 1; i < spans.length; i++) if (spans[i].start <= (spans[i - 1].end ?? "9999")) return { kind: "judgment", why: "the corrected periods would overlap" };
  if (!what.length) return { kind: "agree" };
  const lastNow = spans[spans.length - 1];
  if (lastNow.end && p.roleAssignments.some((ra) => iso(ra.startDate)! > lastNow.end!)) return { kind: "judgment", why: `a role starts after Paycom's last day ${lastNow.end}` };
  return { kind: "change", spans, terminate, newEnd: lastNow.end, oldEnd, what };
}

type UndoEntry = {
  id: string; name: string;
  before: { employmentStatus: string; stage: string; terminationDate: string | null };
  oldStints: Array<{ id: string; startDate: string; endDate: string | null; note: string | null }>;
  createdStintIds: string[];
  roleEnds: Array<{ id: string; endDate: string | null }>;
};

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
    await prisma.$transaction(async (tx) => {
      await tx.employmentStint.deleteMany({ where: { id: { in: u.createdStintIds } } });
      for (const s of u.oldStints) await tx.employmentStint.create({ data: { id: s.id, newHireId: u.id, startDate: new Date(s.startDate), endDate: s.endDate ? new Date(s.endDate) : null, note: s.note } });
      for (const r of u.roleEnds) await tx.roleAssignment.update({ where: { id: r.id }, data: { endDate: r.endDate ? new Date(r.endDate) : null } });
      await tx.newHire.update({ where: { id: u.id }, data: { employmentStatus: u.before.employmentStatus, stage: u.before.stage, terminationDate: u.before.terminationDate ? new Date(u.before.terminationDate) : null } });
    });
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
  const people = await loadPeople();
  const changes: Array<{ r: ExportRow; p: Person; plan: Extract<Plan, { kind: "change" }> }> = [];
  const judgment: string[] = [];
  const unmatched: ExportRow[] = [];
  let agree = 0;
  for (const r of rows) {
    const p = matchPerson(r, people);
    if (!p) { unmatched.push(r); continue; }
    const plan = planFor(r, p, note);
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
    const entry: UndoEntry = {
      id: p.id, name: p.name,
      before: { employmentStatus: p.employmentStatus, stage: p.stage, terminationDate: iso(p.terminationDate) ? p.terminationDate!.toISOString() : null },
      oldStints: p.employmentStints.map((s) => ({ id: s.id, startDate: s.startDate.toISOString(), endDate: s.endDate?.toISOString() ?? null, note: s.note })),
      createdStintIds: [], roleEnds: []
    };
    await prisma.$transaction(async (tx) => {
      await tx.employmentStint.deleteMany({ where: { id: { in: p.employmentStints.map((s) => s.id) } } });
      for (const s of plan.spans) {
        const c = await tx.employmentStint.create({ data: { newHireId: p.id, startDate: date(s.start), endDate: s.end ? date(s.end) : null, note: s.note } });
        entry.createdStintIds.push(c.id);
      }
      if (plan.newEnd) {
        const end = date(plan.newEnd);
        // Roles still open, or ending on the old last day, end on Paycom's last day instead.
        const roles = p.roleAssignments.filter((ra) => !ra.endDate || (plan.oldEnd && iso(ra.endDate) === plan.oldEnd));
        entry.roleEnds = roles.map((ra) => ({ id: ra.id, endDate: ra.endDate?.toISOString() ?? null }));
        await tx.roleAssignment.updateMany({ where: { id: { in: roles.map((ra) => ra.id) } }, data: { endDate: end } });
        await tx.newHire.update({ where: { id: p.id }, data: plan.terminate ? { employmentStatus: "TERMINATED", stage: "ARCHIVED", terminationDate: end } : { terminationDate: end } });
      }
    });
    record.people.push(entry);
    fs.writeFileSync(undoFile, JSON.stringify(record, null, 1)); // after every person, so a crash still leaves a usable undo
    console.log(`applied: ${p.name}`);
  }
  console.log(`\nLOADED ${todo.length}. Undo: npx tsx prisma/import-paycom-employee-dates.ts --undo ${path.relative(process.cwd(), undoFile)}`);
}

main().finally(() => prisma.$disconnect());
