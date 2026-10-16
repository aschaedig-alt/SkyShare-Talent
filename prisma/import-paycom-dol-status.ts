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
import { periodsOf } from "@/lib/data/headcount-history";
import { readExport, matchPerson } from "./paycom-employee-export";

const SOURCE = "paycom-dol-status";
const UNDO_DIR = path.join(process.cwd(), "scripts", "paycom-dol-status");
const DAY = 86_400_000;
// Every full staff list in the roster workbook that records a type (its tabs; the
// pilots-only VaxPilots list is not one) - the same dates import-employment-types.ts derives.
const LISTS = ["2017-12-31", "2018-12-31", "2019-12-31", "2020-12-31", "2021-12-31", "2022-09-20", "2024-08-13"].map((s) => Date.parse(`${s}T00:00:00Z`));

const iso = (t: number | null) => (t === null ? "open" : new Date(t).toISOString().slice(0, 10));
const dayOf = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const WORDS: Record<string, string> = { FULL_TIME: "Full time", PART_TIME: "Part time" };

type Change =
  | { kind: "create"; type: string; start: number; end: number | null }
  | { kind: "switch"; closeId: string; oldType: string; oldEnd: number | null; cut: number; type: string; end: number | null };

async function undo(file: string) {
  const rec = JSON.parse(fs.readFileSync(file, "utf8")) as { created: string[]; closed: Array<{ id: string; endDate: string | null }> };
  const del = await prisma.employmentTypePeriod.deleteMany({ where: { id: { in: rec.created }, source: SOURCE } });
  for (const c of rec.closed) await prisma.employmentTypePeriod.update({ where: { id: c.id }, data: { endDate: c.endDate ? new Date(c.endDate) : null } });
  console.log(`undo: deleted ${del.count} of ${rec.created.length} periods, reopened ${rec.closed.length}`);
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
  const people = await prisma.newHire.findMany({
    where: { canceled: false },
    select: {
      id: true, name: true, legalName: true, startDate: true, terminationDate: true,
      employmentStints: { select: { startDate: true, endDate: true } },
      roleAssignments: { select: { startDate: true, endDate: true } },
      employmentTypePeriods: { select: { id: true, type: true, startDate: true, endDate: true, source: true } }
    }
  });
  const already = await prisma.employmentTypePeriod.count({ where: { source: SOURCE } });

  const plans: Array<{ name: string; id: string; at: number; change: Change }> = [];
  const forPerson: string[] = [];
  const tally: Record<string, number> = {};
  const bump = (k: string) => (tally[k] = (tally[k] ?? 0) + 1);
  for (const r of rows) {
    if (!r.dol) { bump("Paycom has no DOL status"); continue; }
    const p = matchPerson(r, people);
    if (!p) { bump("not matched to one person"); forPerson.push(`${r.label}: not matched to one person`); continue; }
    const at = r.term ? Date.parse(`${r.term}T00:00:00Z`) : asOf;
    const emp = periodsOf(p).map((x) => ({ start: dayOf(x.start), end: x.end ? dayOf(x.end) : null })).find((x) => x.start <= at && (x.end === null || x.end >= at));
    if (!emp) { bump("no employment in the app on that day"); forPerson.push(`${p.name}: Paycom ${WORDS[r.dol]} on ${iso(at)}, but the app has no employment that day`); continue; }
    const inside = p.employmentTypePeriods
      .map((t) => ({ ...t, s: dayOf(t.startDate), e: t.endDate ? dayOf(t.endDate) : null }))
      .filter((t) => t.s >= emp.start && (emp.end === null || t.s <= emp.end))
      .sort((a, b) => a.s - b.s);
    const cover = inside.find((t) => t.s <= at && (t.e === null || t.e >= at));
    if (cover) {
      if (cover.type === r.dol) { bump("same type already on file"); continue; }
      if (r.dol === "PART_TIME" && ["DAY_RATE", "TEMP", "LEAVE"].includes(cover.type)) { bump(`workbook's ${cover.type} kept`); continue; }
      const lists = LISTS.filter((d) => d >= cover.s && d < at);
      if (!lists.length) { bump("changed type, no list to date it"); forPerson.push(`${p.name}: ${cover.type} from ${iso(cover.s)} on file, Paycom says ${WORDS[r.dol]}, and no staff list dates the change`); continue; }
      const cut = Math.max(...lists);
      plans.push({ name: p.name, id: p.id, at, change: { kind: "switch", closeId: cover.id, oldType: cover.type, oldEnd: cover.e, cut, type: r.dol, end: emp.end } });
      bump("changed type");
      continue;
    }
    const prevList = LISTS.filter((d) => d < at);
    const reach = prevList.length ? Math.max(...prevList) + DAY : emp.start;
    const before = inside.filter((t) => t.e !== null && t.e < at).map((t) => (t.e as number) + DAY);
    const start = Math.max(emp.start, reach, ...before);
    const after = inside.find((t) => t.s > at);
    if (after) { bump("a later type already on file"); forPerson.push(`${p.name}: a type starting ${iso(after.s)} is on file after Paycom's point ${iso(at)}`); continue; }
    plans.push({ name: p.name, id: p.id, at, change: { kind: "create", type: r.dol, start, end: emp.end } });
    bump(`new: ${WORDS[r.dol]}`);
  }

  console.log(`export rows ${rows.length} | ${Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(" | ")}`);
  if (already) console.log(`NOTE: ${already} ${SOURCE} rows are already loaded`);
  for (const pl of plans) {
    const c = pl.change;
    console.log(c.kind === "create"
      ? `  ${pl.name}: ${WORDS[c.type]} ${iso(c.start)}..${iso(c.end)}  (Paycom, as of ${iso(pl.at)})`
      : `  ${pl.name}: ${c.oldType} now ends ${iso(c.cut)} (was ${iso(c.oldEnd)}), then ${WORDS[c.type]} ${iso(c.cut + DAY)}..${iso(c.end)}  (Paycom, as of ${iso(pl.at)})`);
  }
  if (forPerson.length) console.log(`\nFOR A PERSON - not loaded:\n  ${forPerson.join("\n  ")}`);
  // Re-running is safe: the plan is made from what is on file, so a type already
  // loaded reads as "same type already on file" and is not loaded twice.
  if (!apply) { console.log("\nDRY RUN - nothing written."); return; }

  const todo = plans.filter((pl) => !only || only.has(pl.name));
  if (only && todo.length !== only.size) throw new Error(`--only named ${only.size} people, ${todo.length} of them have a change`);
  fs.mkdirSync(UNDO_DIR, { recursive: true });
  const undoFile = path.join(UNDO_DIR, `undo-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const rec = { loadedAt: new Date().toISOString(), source: SOURCE, created: [] as string[], closed: [] as Array<{ id: string; endDate: string | null }> };
  for (const pl of todo) {
    const c = pl.change;
    await prisma.$transaction(async (tx) => {
      if (c.kind === "switch") {
        await tx.employmentTypePeriod.update({ where: { id: c.closeId }, data: { endDate: new Date(c.cut) } });
        rec.closed.push({ id: c.closeId, endDate: c.oldEnd === null ? null : new Date(c.oldEnd).toISOString() });
      }
      const start = c.kind === "switch" ? c.cut + DAY : c.start;
      const made = await tx.employmentTypePeriod.create({ data: { newHireId: pl.id, type: c.type, startDate: new Date(start), endDate: c.end === null ? null : new Date(c.end), source: SOURCE, note: `${note}: ${WORDS[c.type]} as of ${iso(pl.at)}` } });
      rec.created.push(made.id);
    });
    fs.writeFileSync(undoFile, JSON.stringify(rec, null, 1));
  }
  console.log(`\nLOADED ${todo.length}. Undo: npx tsx prisma/import-paycom-dol-status.ts --undo ${path.relative(process.cwd(), undoFile)}`);
}

main().finally(() => prisma.$disconnect());
