// Load which KIND of employee somebody was, and when - full time, part time, day
// rate, temp or on leave - from the "Employee Roster MASTER" workbook into
// EmploymentTypePeriod. Contract is NOT here: ContractPeriod already records it
// (prisma/import-contract-history.ts) and wins wherever both cover a date.
//
// Asked for 2026-09-29: "also want to know full time vs part time vs contract vs
// anything else in this category."
//
// EVIDENCE - dated points, one type each, per person:
//   2017.12.31 and 2018.12.31 carry a tick per person in "Full time" / "Part time"
//     columns (2018 also "Contract", and its contract-pilot section - both skipped).
//   2019.12.31, 2020.12.31, 2021.12.31, VaxPilots2022.07.29, 2022.09.20 COVID and
//     the "2024" tab (dated Aug 13, 2024 by the latest hire date on it) carry TYPE:
//     Full-Time, Part-Time, Day-Rate, Temp, Medical/Military Leave. "Contract" is
//     skipped. TYPE is the authority over those tabs' tick columns, which carry
//     typos (see the contract loader).
//   The Terminated tab: their TYPE when they left, at their last day on file
//     (skipped for anybody listed there twice).
//   2010-2016 are payroll exports: their Pay Type says Salaried or Hourly, which is
//     not full or part time, so those years get no points and read "not recorded".
//
// A PERIOD per run of same-type points, inside one employment period: the first
// run back to the day after the previous full staff list that records a type (or
// the period's start, if later) - the gap that list could have seen and did not,
// so the 2024 list's people are typed through 2023, which has no list at all - and
// before the first such list (2017) from Jan 1 of that year, NOT the period's
// start, which would stamp "full-time" on 2010-2016 people from the 2017 list;
// each later run from the day after the last point of the run before it (a change
// is taken to happen right after the last list that showed the old type), and the
// last run to the period's end - open when the period is. Nothing records a type
// after Aug 2024, so somebody hired later has none, and a type is carried forward
// from the last list that showed it.
//
//   npx tsx prisma/import-employment-types.ts                 dry run - prints the review
//   npx tsx prisma/import-employment-types.ts --apply         loads, writes an undo record
//   npx tsx prisma/import-employment-types.ts --undo <file>   deletes exactly the rows it loaded

import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { periodsOf } from "@/lib/data/headcount-history";

const FILE = "C:/Users/Recruiter/Downloads/Employee Roster MASTER.xlsx";
const SOURCE = "roster-workbook";
const UNDO_DIR = path.join(process.cwd(), "scripts", "employment-types");
const DAY = 86_400_000;

type Type = "FULL_TIME" | "PART_TIME" | "DAY_RATE" | "TEMP" | "LEAVE";
type Point = { at: number; type: Type; what: string };

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const iso = (t: number | null) => (t === null ? "open" : new Date(t).toISOString().slice(0, 10));
const dayOf = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const excelDay = (v: unknown) => (typeof v === "number" && v > 20000 && v < 80000 ? Date.UTC(1899, 11, 30) + Math.round(v) * DAY : null);
/** The roster import's own key: "Last, First M" -> "first last". */
function wbKey(raw: string): string | null {
  const s = clean(raw);
  if (!s.includes(",")) return null;
  const [last, rest] = s.split(",");
  const first = (rest || "").trim().split(/\s+/)[0] || "";
  if (!first || !last.trim()) return null;
  return `${first} ${last.trim()}`.replace(/\s+/g, " ").toLowerCase();
}
/** TYPE -> a type, null for contract (ContractPeriod's), blank or anything unrecognised. */
function typeOf(raw: string): Type | null {
  if (/contract|1099/i.test(raw)) return null;
  if (/full.?time/i.test(raw)) return "FULL_TIME";
  if (/part.?time/i.test(raw)) return "PART_TIME";
  if (/day.?rate/i.test(raw)) return "DAY_RATE";
  if (/\btemp\b/i.test(raw)) return "TEMP";
  if (/leave/i.test(raw)) return "LEAVE";
  return null;
}

function readWorkbook(): { byKey: Map<string, Point[]>; terminated: Map<string, { type: Type; raw: string }>; notes: string[]; lists: number[] } {
  const wb = XLSX.readFile(FILE);
  const byKey = new Map<string, Point[]>();
  const notes: string[] = [];
  const lists: number[] = [];
  const add = (key: string, p: Point) => byKey.set(key, [...(byKey.get(key) ?? []), p]);

  for (const sheet of wb.SheetNames) {
    const m = /^(\d{4})(?:\.(\d{2})\.(\d{2}))?(?:$| )/.exec(sheet) ?? /^VaxPilots(\d{4})\.(\d{2})\.(\d{2})$/.exec(sheet);
    if (!m) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, defval: "" });
    const hi = rows.findIndex((r) => r.some((c) => /^(name:?|employee name)$/i.test(clean(c))));
    if (hi < 0) continue;
    const hdr = rows[hi].map((c) => clean(c).toLowerCase());
    const col = (re: RegExp, avoid?: RegExp) => hdr.findIndex((h) => re.test(h) && (!avoid || !avoid.test(h)));
    const iName = col(/name/), iType = col(/^type$/), iTerm = col(/termination/), iAnniv = col(/anniv/, /sort/);
    const iFull = col(/^full ?time$/), iPart = col(/^part ?time$/), iContract = col(/^contract$/);
    if (iType < 0 && (iFull < 0 || iPart < 0)) continue; // 2010-2016: Pay Type only - no full or part time

    let at: number;
    if (m[2]) at = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    else {
      const hires = rows.slice(hi + 1).map((r) => excelDay(r[iAnniv])).filter((t): t is number => t !== null);
      at = Math.max(...hires);
      notes.push(`"${sheet}" tab has no date; dated ${iso(at)}, the latest hire date on it.`);
    }
    if (!/^VaxPilots/.test(sheet)) lists.push(at);

    let section = "";
    for (const r of rows.slice(hi + 1)) {
      const nameCell = clean(r[iName]);
      const key = wbKey(nameCell);
      if (!key) { if (nameCell && !/^AA /i.test(nameCell)) section = nameCell; continue; }
      const term = iTerm >= 0 ? excelDay(r[iTerm]) : null;
      if (term !== null && term < at) continue;
      if (iType >= 0) {
        const raw = clean(r[iType]);
        const type = typeOf(raw);
        if (type) add(key, { at, type, what: `${sheet} list: ${raw}` });
        continue;
      }
      // 2017 / 2018: the per-person ticks. A contract tick or the contract section is not ours.
      if (/contract/i.test(section) || (iContract >= 0 && clean(r[iContract]) && clean(r[iContract]) !== "0")) continue;
      const full = clean(r[iFull]) === "1", part = clean(r[iPart]) === "1";
      if (full !== part) add(key, { at, type: full ? "FULL_TIME" : "PART_TIME", what: `${sheet} list: ${full ? "Full time" : "Part time"} tick` });
    }
  }

  const terminated = new Map<string, { type: Type; raw: string }>();
  const seen = new Map<string, number>();
  const trows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Terminated"], { header: 1, defval: "" });
  const th = trows[0].map((c) => clean(c).toLowerCase());
  const tName = th.indexOf("name"), tType = th.indexOf("type");
  for (const r of trows.slice(1)) {
    const key = wbKey(clean(r[tName]));
    if (!key) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    const raw = clean(r[tType]);
    const type = typeOf(raw);
    if (type) terminated.set(key, { type, raw });
  }
  for (const [key, n] of seen) if (n > 1) terminated.delete(key);
  return { byKey, terminated, notes, lists };
}

/**
 * Runs of same-type points -> periods, inside each employment period. `lists` is
 * the date of every full staff list that records a type (not the pilots-only Vax
 * list: a non-pilot missing from it says nothing), which bounds how far back the
 * first run reaches.
 */
function typePeriods(periods: Array<{ start: Date; end: Date | null }>, points: Point[], lists: number[]) {
  const out: Array<{ type: Type; start: number; end: number | null; evidence: Point[] }> = [];
  for (const p of periods) {
    const from = dayOf(p.start);
    const to = p.end ? dayOf(p.end) : null;
    const inside = points.filter((x) => x.at >= from && (to === null || x.at <= to)).sort((a, b) => a.at - b.at);
    const runs: Point[][] = [];
    for (const x of inside) {
      const last = runs[runs.length - 1];
      if (last && last[last.length - 1].type === x.type) last.push(x);
      else runs.push([x]);
    }
    runs.forEach((run, i) => {
      const before = lists.filter((d) => d < run[0].at);
      const reach = before.length ? Math.max(...before) + DAY : Date.UTC(new Date(Math.min(...lists)).getUTCFullYear(), 0, 1);
      const start = i === 0 ? Math.max(from, reach) : runs[i - 1][runs[i - 1].length - 1].at + DAY;
      const end = i === runs.length - 1 ? to : run[run.length - 1].at;
      out.push({ type: run[0].type, start, end, evidence: run });
    });
  }
  return out;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const undoIdx = process.argv.indexOf("--undo");
  if (undoIdx >= 0) {
    const file = process.argv[undoIdx + 1];
    if (!file) throw new Error("--undo needs the undo file it wrote");
    const rec = JSON.parse(fs.readFileSync(file, "utf8")) as { ids: string[] };
    const res = await prisma.employmentTypePeriod.deleteMany({ where: { id: { in: rec.ids }, source: SOURCE } });
    console.log(`undo: deleted ${res.count} of the ${rec.ids.length} type periods listed in ${file}`);
    return;
  }

  const { byKey, terminated, notes, lists } = readWorkbook();
  const hires = await prisma.newHire.findMany({
    where: { canceled: false },
    select: {
      id: true, name: true, importKey: true, startDate: true, terminationDate: true,
      employmentStints: { select: { startDate: true, endDate: true } },
      roleAssignments: { select: { startDate: true, endDate: true } }
    }
  });
  const byImportKey = new Map(hires.filter((h) => h.importKey?.startsWith("roster:")).map((h) => [h.importKey!.slice(7), h]));
  const nameCount = new Map<string, number>();
  for (const h of hires) { const k = h.name.toLowerCase().replace(/\s+/g, " ").trim(); nameCount.set(k, (nameCount.get(k) ?? 0) + 1); }
  const byName = new Map(hires.map((h) => [h.name.toLowerCase().replace(/\s+/g, " ").trim(), h]));
  const recordFor = (key: string) => byImportKey.get(key) ?? (nameCount.get(key) === 1 ? byName.get(key) : undefined);

  const pointsById = new Map<string, Point[]>();
  let unmatchedKeys = 0;
  for (const [key, pts] of byKey) {
    const h = recordFor(key);
    if (!h) { unmatchedKeys++; continue; }
    pointsById.set(h.id, [...(pointsById.get(h.id) ?? []), ...pts]);
  }
  for (const [key, t] of terminated) {
    const h = recordFor(key);
    if (!h) continue;
    const ended = periodsOf(h).map((p) => p.end).filter((e): e is Date => e !== null).sort((a, b) => b.getTime() - a.getTime())[0];
    if (ended) pointsById.set(h.id, [...(pointsById.get(h.id) ?? []), { at: dayOf(ended), type: t.type, what: `Terminated tab: ${t.raw} (last day on file)` }]);
  }

  const plan = hires
    .map((h) => ({ h, found: typePeriods(periodsOf(h), pointsById.get(h.id) ?? [], lists) }))
    .filter((x) => x.found.length > 0);
  const rows = plan.flatMap((x) => x.found.map((f) => ({ id: x.h.id, name: x.h.name, ...f })));

  console.log(`# Employment types - ${apply ? "APPLY" : "DRY RUN"} ${new Date().toISOString().slice(0, 10)}`);
  console.log(`${plan.length} people get ${rows.length} type periods. Workbook names with no record in the app: ${unmatchedKeys}.`);
  for (const n of notes) console.log(`- ${n}`);
  const byType = new Map<string, number>(); for (const r of rows) byType.set(r.type, (byType.get(r.type) ?? 0) + 1);
  console.log(`periods by type: ${[...byType].map(([k, v]) => `${k} ${v}`).join(", ")}`);
  const changed = plan.filter((x) => new Set(x.found.map((f) => f.type)).size > 1);
  console.log(`people whose type changed at least once: ${changed.length}`);
  for (const x of changed.slice(0, 40)) console.log(`   ${x.h.name}: ${x.found.map((f) => `${f.type} ${iso(f.start)}..${iso(f.end)}`).join(" | ")}`);
  for (let y = 2017; y <= new Date().getUTCFullYear() - 1; y++) {
    const at = Date.UTC(y, 11, 31);
    const c = new Map<string, number>();
    for (const r of rows) if (r.start <= at && (r.end === null || r.end >= at)) c.set(r.type, (c.get(r.type) ?? 0) + 1);
    console.log(`   Dec 31 ${y}: ${[...c].map(([k, v]) => `${k} ${v}`).join(", ") || "none"}`);
  }

  if (!apply) { console.log(`Dry run - nothing written. Load with --apply.`); return; }
  const existing = await prisma.employmentTypePeriod.count({ where: { source: SOURCE } });
  if (existing) throw new Error(`${existing} ${SOURCE} rows already loaded - undo them first (--undo <file>).`);
  const created: string[] = [];
  for (let i = 0; i < rows.length; i += 100) {
    const made = await prisma.$transaction(rows.slice(i, i + 100).map((r) => prisma.employmentTypePeriod.create({
      data: { newHireId: r.id, type: r.type, startDate: new Date(r.start), endDate: r.end === null ? null : new Date(r.end), source: SOURCE, note: r.evidence.map((e) => `${iso(e.at)} ${e.what}`).join("; ").slice(0, 1000) },
      select: { id: true }
    })));
    created.push(...made.map((m) => m.id));
  }
  fs.mkdirSync(UNDO_DIR, { recursive: true });
  const undoFile = path.join(UNDO_DIR, `undo-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(undoFile, JSON.stringify({ loadedAt: new Date().toISOString(), source: SOURCE, ids: created }));
  console.log(`LOADED ${created.length} type periods. Undo: npx tsx prisma/import-employment-types.ts --undo ${path.relative(process.cwd(), undoFile)}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
