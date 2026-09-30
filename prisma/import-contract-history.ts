// Load contract history - who worked for SkyShare as a CONTRACTOR (1099), and when -
// from the "Employee Roster MASTER" workbook into ContractPeriod.
//
// Why: employmentStatus CONTRACT says what somebody is TODAY and nothing about before,
// and the roster import (prisma/import-employee-roster.ts) read only names, positions
// and dates - never the TYPE column. So every contractor who later left, or later
// became an employee, read as an employee in every past year-end headcount. The
// workbook's own notes tab says "2018.12.31: 35, 6 contractors"; the Headcount &
// Tenure report said 41 on staff.
//
// EVIDENCE - dated points, "employee" or "contractor", per person:
//   - Every list that names them, on that list's date.
//       2010-2017 year-end tabs are payroll exports: employees by definition, a 1099
//         contractor is not on payroll. A row whose own termination date is before the
//         list's date is not on staff that day and says nothing.
//       2018.12.31 has no TYPE column; its "CB AVIATION CONTRACT PILOTS" section is the
//         marker, and everybody above it is staff.
//       2019.12.31, 2020.12.31, 2021.12.31, VaxPilots2022.07.29, 2022.09.20 COVID and
//         the undated "2024" tab carry TYPE: "Contract 1099" or "Contract" is a
//         contractor; Full-Time, Part-Time, Day-Rate, Temp and leave are employees. The
//         2024 tab is dated by the latest hire date on it (Aug 13, 2024).
//       TYPE is the authority, not the tabs' count columns (All / Fulltime / Part Time /
//       Contract): those carry typos - a Full-Time technician ticked Contract in 2021, a
//       Contract 1099 pilot unticked - while TYPE reproduces each tab's own totals row
//       (2020: 41 full time, 9 part time, 1 on leave, 3 contract). A blank TYPE says
//       contractor only under a contract heading or in a "... - Contract" department.
//   - The Terminated tab: their TYPE when they left, dated at their last day on file.
//     Skipped for anybody with two rows there - which departure would it be?
//   - The app, today, for anybody on staff now: CONTRACT or not.
//   - The app's start date, when it falls INSIDE an employment period rather than at
//     its start: the date the app has them starting as an employee (a contractor
//     converted - the quality manager on the 2022 list as Contract, on staff since
//     2021, has a start date of Dec 2023).
//
// A CONTRACT PERIOD is each run of contractor points inside one employment period:
// from the day after the employee point before it (or the period's start, when none)
// to the day before the employee point after it (or the period's end - open when
// they are contracting today). A point on a date the database has them off staff
// changes nothing and is listed in the review instead.
//
//   npx tsx prisma/import-contract-history.ts                 dry run - prints the review
//   npx tsx prisma/import-contract-history.ts --apply         loads, writes an undo record
//   npx tsx prisma/import-contract-history.ts --undo <file>   deletes exactly the rows it loaded

import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { periodsOf } from "@/lib/data/headcount-history";

const FILE = "C:/Users/Recruiter/Downloads/Employee Roster MASTER.xlsx";
const SOURCE = "roster-workbook";
const UNDO_DIR = path.join(process.cwd(), "scripts", "contract-history");
const DAY = 86_400_000;

type Kind = "employee" | "contractor";
type Point = { at: number; kind: Kind; what: string };
type Period = { start: Date; end: Date | null };

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const iso = (t: number | Date | null) => (t === null ? "open" : new Date(t).toISOString().slice(0, 10));
const dayOf = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
function excelDay(v: unknown): number | null {
  return typeof v === "number" && v > 20000 && v < 80000 ? Date.UTC(1899, 11, 30) + Math.round(v) * DAY : null;
}
/** The roster import's own key: "Last, First M" -> "first last". */
function wbKey(raw: string): string | null {
  const s = clean(raw);
  if (!s.includes(",")) return null;
  const [last, rest] = s.split(",");
  const first = (rest || "").trim().split(/\s+/)[0] || "";
  if (!first || !last.trim()) return null;
  return `${first} ${last.trim()}`.replace(/\s+/g, " ").toLowerCase();
}
function kindOfType(type: string): Kind | null {
  if (/contract|1099/i.test(type)) return "contractor";
  if (/full.?time|part.?time|day.?rate|\btemp\b|leave|intern/i.test(type)) return "employee";
  return null;
}

// ---------------------------------------------------------------------------
// The workbook -> points keyed by the roster import's name key.
// ---------------------------------------------------------------------------
function readWorkbook(): { byKey: Map<string, Point[]>; terminated: Map<string, { kind: Kind; type: string }>; notes: string[] } {
  const wb = XLSX.readFile(FILE);
  const byKey = new Map<string, Point[]>();
  const notes: string[] = [];
  const add = (key: string, p: Point) => byKey.set(key, [...(byKey.get(key) ?? []), p]);

  for (const sheet of wb.SheetNames) {
    const m = /^(\d{4})(?:\.(\d{2})\.(\d{2}))?(?:$| )/.exec(sheet) ?? /^VaxPilots(\d{4})\.(\d{2})\.(\d{2})$/.exec(sheet);
    if (!m) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, defval: "" });
    const hi = rows.findIndex((r) => r.some((c) => /^(name:?|employee name)$/i.test(clean(c))));
    if (hi < 0) continue;
    const hdr = rows[hi].map((c) => clean(c).toLowerCase());
    const col = (re: RegExp, avoid?: RegExp) => hdr.findIndex((h) => re.test(h) && (!avoid || !avoid.test(h)));
    const iName = col(/name/), iType = col(/^type$/), iDept = col(/department/), iTerm = col(/termination/), iAnniv = col(/anniv/, /sort/);
    const payroll = hdr[iName] === "employee name";

    let at: number;
    if (m[2]) at = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    else {
      // The bare "2024" tab: dated by the latest anniversary (hire date) on it.
      const hires = rows.slice(hi + 1).map((r) => excelDay(r[iAnniv])).filter((t): t is number => t !== null);
      at = Math.max(...hires);
      notes.push(`"${sheet}" tab has no date; dated ${iso(at)}, the latest hire date on it.`);
    }

    let section = "";
    for (const r of rows.slice(hi + 1)) {
      const nameCell = clean(r[iName]);
      const key = wbKey(nameCell);
      if (!key) {
        if (nameCell && !/^AA /i.test(nameCell)) section = nameCell;
        continue;
      }
      if (payroll) {
        const term = iTerm >= 0 ? excelDay(r[iTerm]) : null;
        if (term !== null && term < at) continue;
        add(key, { at, kind: "employee", what: `${sheet} payroll list` });
        continue;
      }
      const type = iType >= 0 ? clean(r[iType]) : "";
      const dept = iDept >= 0 ? clean(r[iDept]) : "";
      let kind = kindOfType(type);
      let why = type;
      if (!kind && (/contract/i.test(section) || /-\s*contract/i.test(dept))) { kind = "contractor"; why = /contract/i.test(section) ? `under "${section}"` : dept; }
      else if (!kind && iType < 0) { kind = "employee"; why = section ? `under "${section}"` : "listed"; }
      if (!kind) continue;
      add(key, { at, kind, what: `${sheet} list: ${why}` });
    }
  }

  const terminated = new Map<string, { kind: Kind; type: string }>();
  const seen = new Map<string, number>();
  const trows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Terminated"], { header: 1, defval: "" });
  const th = trows[0].map((c) => clean(c).toLowerCase());
  const tName = th.indexOf("name"), tType = th.indexOf("type"), tDept = th.indexOf("department");
  for (const r of trows.slice(1)) {
    const key = wbKey(clean(r[tName]));
    if (!key) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    const type = clean(r[tType]);
    const kind = kindOfType(type) ?? (/-\s*contract/i.test(clean(r[tDept])) ? "contractor" : null);
    if (kind) terminated.set(key, { kind, type: type || clean(r[tDept]) });
  }
  for (const [key, n] of seen) if (n > 1) { terminated.delete(key); notes.push(`Terminated tab lists "${key}" ${n} times - that evidence is skipped.`); }
  return { byKey, terminated, notes };
}

// ---------------------------------------------------------------------------
// Points -> contract periods, inside each employment period.
// ---------------------------------------------------------------------------
function contractPeriods(periods: Period[], points: Point[]): Array<{ start: number; end: number | null; evidence: Point[] }> {
  const out: Array<{ start: number; end: number | null; evidence: Point[] }> = [];
  for (const p of periods) {
    const from = dayOf(p.start);
    const to = p.end ? dayOf(p.end) : null;
    const inside = points.filter((x) => x.at >= from && (to === null || x.at <= to)).sort((a, b) => a.at - b.at || (a.kind === b.kind ? 0 : a.kind === "employee" ? -1 : 1));
    for (let i = 0; i < inside.length; i++) {
      if (inside[i].kind !== "contractor") continue;
      let j = i;
      while (j + 1 < inside.length && inside[j + 1].kind === "contractor") j++;
      const before = i > 0 ? inside[i - 1] : null;
      const after = j + 1 < inside.length ? inside[j + 1] : null;
      out.push({ start: before ? before.at + DAY : from, end: after ? after.at - DAY : to, evidence: inside.slice(i, j + 1) });
      i = j;
    }
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
    const res = await prisma.contractPeriod.deleteMany({ where: { id: { in: rec.ids }, source: SOURCE } });
    console.log(`undo: deleted ${res.count} of the ${rec.ids.length} contract periods listed in ${file}`);
    return;
  }

  const { byKey, terminated, notes } = readWorkbook();
  const now = new Date();
  const today = dayOf(now);

  const hires = await prisma.newHire.findMany({
    where: { canceled: false },
    select: {
      id: true, name: true, importKey: true, employmentStatus: true, startDate: true, terminationDate: true,
      employmentStints: { select: { startDate: true, endDate: true } },
      roleAssignments: { select: { title: true, seat: true, fleetPositionSlug: true, startDate: true, endDate: true } }
    }
  });
  // Workbook key -> record: the roster import's own key first, then an exact name
  // that only one record has.
  const byImportKey = new Map(hires.filter((h) => h.importKey?.startsWith("roster:")).map((h) => [h.importKey!.slice(7), h]));
  const nameCount = new Map<string, number>();
  for (const h of hires) { const n = h.name.toLowerCase().replace(/\s+/g, " ").trim(); nameCount.set(n, (nameCount.get(n) ?? 0) + 1); }
  const byName = new Map(hires.map((h) => [h.name.toLowerCase().replace(/\s+/g, " ").trim(), h]));
  const recordFor = (key: string) => byImportKey.get(key) ?? (nameCount.get(key) === 1 ? byName.get(key) : undefined);

  const pointsById = new Map<string, Point[]>();
  const unmatched: string[] = [];
  for (const [key, pts] of byKey) {
    const h = recordFor(key);
    if (!h) { if (pts.some((p) => p.kind === "contractor")) unmatched.push(`${key} (${pts.filter((p) => p.kind === "contractor").map((p) => p.what).join("; ")})`); continue; }
    pointsById.set(h.id, [...(pointsById.get(h.id) ?? []), ...pts]);
  }
  for (const [key, t] of terminated) {
    const h = recordFor(key);
    if (!h) { if (t.kind === "contractor") unmatched.push(`${key} (Terminated tab: ${t.type})`); continue; }
    const ended = periodsOf(h).map((p) => p.end).filter((e): e is Date => e !== null).sort((a, b) => b.getTime() - a.getTime())[0];
    if (!ended) continue;
    pointsById.set(h.id, [...(pointsById.get(h.id) ?? []), { at: dayOf(ended), kind: t.kind, what: `Terminated tab: ${t.type} (last day on file)` }]);
  }

  type Plan = { id: string; name: string; status: string; periods: Period[]; points: Point[]; found: ReturnType<typeof contractPeriods>; offStaff: Point[] };
  const plans: Plan[] = [];
  for (const h of hires) {
    const periods = periodsOf(h);
    const points = [...(pointsById.get(h.id) ?? [])];
    const onNow = periods.some((p) => dayOf(p.start) <= today && (!p.end || dayOf(p.end) >= today));
    if (onNow) points.push({ at: today, kind: h.employmentStatus === "CONTRACT" ? "contractor" : "employee", what: `the app today: ${h.employmentStatus}` });
    if (h.startDate && periods.some((p) => dayOf(p.start) < dayOf(h.startDate!) && (!p.end || dayOf(p.end) >= dayOf(h.startDate!)))) {
      points.push({ at: dayOf(h.startDate), kind: "employee", what: "the app's start date" });
    }
    if (!points.some((p) => p.kind === "contractor")) continue;
    const found = contractPeriods(periods, points);
    const covered = (t: number) => periods.some((p) => dayOf(p.start) <= t && (!p.end || dayOf(p.end) >= t));
    plans.push({ id: h.id, name: h.name, status: h.employmentStatus, periods, points: points.sort((a, b) => a.at - b.at), found, offStaff: points.filter((p) => p.kind === "contractor" && !covered(p.at)) });
  }
  plans.sort((a, b) => a.name.localeCompare(b.name));

  // --- The review ----------------------------------------------------------
  const rows = plans.flatMap((p) => p.found.map((f) => ({ plan: p, f })));
  const firstYear = 2010, lastYear = now.getUTCFullYear() - 1;
  console.log(`# Contract history - ${apply ? "APPLY" : "DRY RUN"} ${iso(now.getTime())}\n`);
  console.log(`Source: ${FILE}. ${plans.length} people have contractor evidence; ${rows.length} contract periods from it.\n`);
  for (const n of notes) console.log(`- ${n}`);
  if (unmatched.length) console.log(`- Contractor evidence for somebody with no record in the app (nothing to attach it to): ${unmatched.join("; ")}`);
  console.log(`\n## Contractors at each year-end, by these periods\n`);
  for (let y = firstYear; y <= lastYear; y++) {
    const at = Date.UTC(y, 11, 31);
    const who = rows.filter(({ plan, f }) => f.start <= at && (f.end === null || f.end >= at) && plan.periods.some((p) => dayOf(p.start) <= at && (!p.end || dayOf(p.end) >= at))).map(({ plan }) => plan.name);
    if (who.length) console.log(`- ${y}: ${who.length} - ${[...new Set(who)].join(", ")}`);
  }
  console.log(`- today: ${plans.filter((p) => p.status === "CONTRACT" && p.periods.some((x) => dayOf(x.start) <= today && (!x.end || dayOf(x.end) >= today))).length} (the app's CONTRACT status, which the report uses for today)`);
  console.log(`\n## Person by person\n`);
  for (const p of plans) {
    console.log(`### ${p.name} - ${p.status} today`);
    console.log(`- employed: ${p.periods.map((x) => `${iso(x.start)} to ${iso(x.end)}`).join("; ") || "no dates"}`);
    console.log(`- evidence: ${p.points.map((x) => `${iso(x.at)} ${x.kind} (${x.what})`).join(" | ")}`);
    console.log(`- CONTRACT PERIODS: ${p.found.map((f) => `${iso(f.start)} to ${iso(f.end)}`).join("; ") || "none inside an employment period"}`);
    if (p.offStaff.length) console.log(`- not used, the database has them off staff that day: ${p.offStaff.map((x) => `${iso(x.at)} (${x.what})`).join("; ")}`);
    console.log("");
  }

  if (!apply) { console.log(`Dry run - nothing written. Load with --apply.`); return; }

  const existing = await prisma.contractPeriod.count({ where: { source: SOURCE } });
  if (existing) throw new Error(`${existing} ${SOURCE} rows already loaded - undo them first (--undo <file>).`);
  const created = await prisma.$transaction(rows.map(({ plan, f }) => prisma.contractPeriod.create({
    data: {
      newHireId: plan.id,
      startDate: new Date(f.start),
      endDate: f.end === null ? null : new Date(f.end),
      source: SOURCE,
      note: f.evidence.map((e) => `${iso(e.at)} ${e.what}`).join("; ").slice(0, 1000)
    },
    select: { id: true }
  })));
  fs.mkdirSync(UNDO_DIR, { recursive: true });
  const undoFile = path.join(UNDO_DIR, `undo-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(undoFile, JSON.stringify({ loadedAt: new Date().toISOString(), source: SOURCE, ids: created.map((c) => c.id) }, null, 2));
  console.log(`LOADED ${created.length} contract periods. Undo: npx tsx prisma/import-contract-history.ts --undo ${path.relative(process.cwd(), undoFile)}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
