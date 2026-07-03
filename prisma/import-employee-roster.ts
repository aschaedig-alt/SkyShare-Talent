// Import the "Employee Roster MASTER" workbook (year-end snapshots 2010→2022 of
// the whole company, CB Aviation → SkyShare) into employee records with dates.
//
// For each unique person (deduped by normalized name) we derive:
//  - employment stint(s): contiguous runs of yearly presence become stints; a
//    gap (or an explicit termination followed by a later appearance) = a rehire.
//  - a role timeline from their position across the years.
//  - birthday (dates only — no address/phone/email/sizes are imported).
// People are MERGED into any existing NewHire by name (so we don't duplicate the
// terminated roster or the pilots); otherwise created, keyed importKey roster:<name>.
//
//   npx tsx prisma/import-employee-roster.ts            (dry run + stats)
//   npx tsx prisma/import-employee-roster.ts --sample "Cory Bengtzen"
//   npx tsx prisma/import-employee-roster.ts --commit

import XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { resolveFleetPosition } from "@/lib/fleet/positions";

const FILE = "C:/Users/Recruiter/Downloads/Employee Roster MASTER.xlsx";

function excelToDate(serial: unknown): Date | null {
  const n = typeof serial === "number" ? serial : Number(serial);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = Math.round((n - 25569) * 86400 * 1000); // Excel(1900) serial -> unix ms
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

// "Last, First M" -> { display: "First Last", key: "first last" }
function parseName(raw: string): { display: string; key: string } | null {
  const s = String(raw || "").trim();
  if (!s || !s.includes(",")) return null; // roster format only; skips section labels/totals
  const [last, rest] = s.split(",");
  const first = (rest || "").trim().split(/\s+/)[0] || "";
  const lastName = last.trim();
  if (!first || !lastName) return null;
  const display = `${first} ${lastName}`.replace(/\s+/g, " ").trim();
  return { display, key: display.toLowerCase() };
}

const normName = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const clean = (v: unknown) => String(v ?? "").trim();

type YearRec = { year: number; position: string; department: string; status: string; hire: Date | null; term: Date | null; birthday: Date | null; anniversary: Date | null };
type Person = { display: string; key: string; years: Map<number, YearRec> };

function loadPeople(): { people: Person[]; snapshotYears: number[] } {
  const wb = XLSX.readFile(FILE);
  const people = new Map<string, Person>();
  const snapshotYears = new Set<number>();

  for (const sheet of wb.SheetNames) {
    // Year-snapshot tabs: "2024" (bare), "YYYY.12.31", or "2022.09.20 COVID".
    // Excludes VaxPilots.../Terminated/TimeCards/Contract/Notes.
    const m = /^(\d{4})(?:$|\.| )/.exec(sheet);
    if (!m) continue;
    const year = Number(m[1]);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, defval: "" });
    const hi = rows.findIndex((r) => r.some((c) => /^(name:?|employee name)$/i.test(clean(c))));
    if (hi < 0) continue;
    snapshotYears.add(year);
    const hdr = rows[hi].map((c) => clean(c).toLowerCase());
    const find = (re: RegExp, avoid?: RegExp) => hdr.findIndex((h) => re.test(h) && (!avoid || !avoid.test(h)));
    const iName = find(/name/);
    const iPos = find(/position/);
    const iDept = find(/department/);
    const iStatus = find(/status/);
    const iHire = find(/hire date/);
    const iTerm = find(/termination/);
    const iBday = find(/^birth ?day$|birth date/, /sort/);
    const iAnniv = find(/anniv/, /sort/);

    for (const r of rows.slice(hi + 1)) {
      const parsed = parseName(clean(r[iName]));
      if (!parsed) continue;
      let p = people.get(parsed.key);
      if (!p) { p = { display: parsed.display, key: parsed.key, years: new Map() }; people.set(parsed.key, p); }
      p.years.set(year, {
        year,
        position: iPos >= 0 ? clean(r[iPos]) : "",
        department: iDept >= 0 ? clean(r[iDept]) : "",
        status: iStatus >= 0 ? clean(r[iStatus]) : "",
        hire: iHire >= 0 ? excelToDate(r[iHire]) : null,
        term: iTerm >= 0 ? excelToDate(r[iTerm]) : null,
        birthday: iBday >= 0 ? excelToDate(r[iBday]) : null,
        anniversary: iAnniv >= 0 ? excelToDate(r[iAnniv]) : null
      });
    }
  }
  return { people: [...people.values()], snapshotYears: [...snapshotYears].sort((a, b) => a - b) };
}

const jan1 = (y: number) => new Date(Date.UTC(y, 0, 1));
const dec31 = (y: number) => new Date(Date.UTC(y, 11, 31));

type Derived = {
  stints: { start: Date; end: Date | null; note: string | null }[];
  roles: { title: string; start: Date; end: Date | null; transitionType: string; seat: string | null; slug: string | null; aircraft: string | null }[];
  start: Date | null;
  end: Date | null;
  current: boolean;
  birthday: Date | null;
  department: string | null;
  latestPosition: string | null;
};

function derive(p: Person, latestYear: number, snapshotYears: number[]): Derived {
  const recs = [...p.years.values()].sort((a, b) => a.year - b.year);
  const yearsPresent = recs.map((r) => r.year);
  const firstYear = yearsPresent[0];
  const lastYear = yearsPresent[yearsPresent.length - 1];
  const explicitHire = recs.map((r) => r.hire).filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0] ?? null;
  const explicitTerm = recs.map((r) => r.term).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null;
  const anniversary = recs.map((r) => r.anniversary).filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0] ?? null;
  const birthday = recs.map((r) => r.birthday).filter(Boolean)[0] ?? null;
  const latestStatus = recs.find((r) => r.year === lastYear)?.status ?? "";
  const inLatest = p.years.has(latestYear);
  const current = inLatest && !/terminat/i.test(latestStatus);

  // Runs of present years -> stints. A gap only counts as "left & came back" if a
  // snapshot year actually exists in the gap and the person is absent from it
  // (a missing snapshot year — e.g. no 2023 tab — is NOT a departure).
  const gapIsReal = (a: number, b: number) => snapshotYears.some((sy) => sy > a && sy < b);
  const runs: Array<[number, number]> = [];
  let runStart = firstYear, prev = firstYear;
  for (const y of yearsPresent.slice(1)) {
    if (gapIsReal(prev, y)) { runs.push([runStart, prev]); runStart = y; }
    prev = y;
  }
  runs.push([runStart, prev]);

  const stints = runs.map(([s, e], i) => {
    const isFirst = i === 0;
    const isLast = i === runs.length - 1;
    const start = isFirst ? explicitHire ?? anniversary ?? jan1(s) : jan1(s);
    const end = isLast ? (current ? null : explicitTerm ?? dec31(e)) : dec31(e);
    return { start, end, note: runs.length > 1 ? (isFirst ? "First stint" : "Returned (rehire)") : null };
  });

  // Role timeline from position across years (collapse consecutive same title).
  const titleFor = (r: YearRec) => (r.position || (r.department && !/unassigned|overhead/i.test(r.department) ? r.department : "")).trim();
  const roleRuns: Array<{ title: string; startY: number; endY: number }> = [];
  for (const r of recs) {
    const t = titleFor(r);
    if (!t) continue;
    const last = roleRuns[roleRuns.length - 1];
    if (last && last.title.toLowerCase() === t.toLowerCase() && r.year - last.endY <= 1) last.endY = r.year;
    else roleRuns.push({ title: t, startY: r.year, endY: r.year });
  }
  const roles = roleRuns.map((run, i) => {
    const fp = resolveFleetPosition(run.title);
    const start = i === 0 ? explicitHire ?? anniversary ?? jan1(run.startY) : jan1(run.startY);
    const end = i < roleRuns.length - 1 ? jan1(roleRuns[i + 1].startY) : current ? null : explicitTerm ?? dec31(run.endY);
    return { title: fp?.title ?? run.title, start, end, transitionType: i === 0 ? "HIRE" : "PROMOTION", seat: fp?.seat ?? null, slug: fp?.slug ?? null, aircraft: fp?.aircraft ?? null };
  });

  return {
    stints,
    roles,
    start: stints[0]?.start ?? null,
    end: current ? null : stints[stints.length - 1]?.end ?? null,
    current,
    birthday,
    department: recs.map((r) => r.department).filter((d) => d && !/unassigned|overhead/i.test(d)).pop() ?? null,
    latestPosition: roleRuns[roleRuns.length - 1]?.title ?? null
  };
}

async function main() {
  const commit = process.argv.includes("--commit");
  const sampleArg = process.argv.find((a, i) => process.argv[i - 1] === "--sample");
  const sample = sampleArg ? normName(sampleArg) : null;

  const { people, snapshotYears } = loadPeople();
  const latestYear = Math.max(...snapshotYears);

  const existing = await prisma.newHire.findMany({ select: { id: true, name: true, importKey: true, terminationDate: true, employmentStatus: true } });
  const byName = new Map(existing.map((h) => [normName(h.name), h]));

  let total = 0, merged = 0, created = 0, rehires = 0, withRoles = 0, committed = 0;
  const samples: string[] = [];

  for (const p of people) {
    total++;
    const d = derive(p, latestYear, snapshotYears);
    if (d.stints.length > 1) rehires++;
    if (d.roles.length) withRoles++;

    const match = byName.get(p.key);
    if (match) merged++;
    else created++;

    // Reconcile with newer data: the MASTER snapshots end at 2022, but the
    // existing record may carry a later termination (from the term-list import).
    // If so, the person actually left — close their last stint/role at that date.
    if (match?.employmentStatus === "TERMINATED" && match.terminationDate) {
      d.current = false;
      d.end = match.terminationDate;
      const lastStint = d.stints[d.stints.length - 1];
      if (lastStint && (lastStint.end === null || lastStint.end < match.terminationDate)) lastStint.end = match.terminationDate;
      const lastRole = d.roles[d.roles.length - 1];
      if (lastRole && (lastRole.end === null || lastRole.end < match.terminationDate)) lastRole.end = match.terminationDate;
    }

    if (sample && p.key === sample) {
      samples.push(`${p.display} [${match ? "MERGE" : "CREATE"}] years=${[...p.years.keys()].sort().join(",")}`);
      samples.push(`  stints: ${d.stints.map((s) => `${s.start.toISOString().slice(0, 10)}→${s.end ? s.end.toISOString().slice(0, 10) : "present"}${s.note ? " (" + s.note + ")" : ""}`).join("  |  ")}`);
      samples.push(`  roles: ${d.roles.map((r) => `${r.title} [${r.transitionType}] ${r.start.toISOString().slice(0, 10)}→${r.end ? r.end.toISOString().slice(0, 10) : "present"}`).join("  |  ") || "(none)"}`);
      samples.push(`  birthday: ${d.birthday ? d.birthday.toISOString().slice(0, 10) : "—"}, current: ${d.current}`);
    }

    if (!commit) continue;

    // Roster "owns" a person if we created them from the MASTER (or they're new);
    // those we fully (re)build. People from the term-list / pilot import keep their
    // authoritative recent dates — we only enrich them with a birthday.
    const rosterOwned = !match || (match.importKey?.startsWith("roster:") ?? false);

    await prisma.$transaction(async (tx) => {
      let hireId = match?.id;
      if (!hireId) {
        const createdHire = await tx.newHire.create({
          data: {
            name: p.display,
            startDate: d.start,
            terminationDate: d.end,
            birthday: d.birthday,
            department: d.department,
            position: d.latestPosition,
            stage: d.current ? "POST_ONBOARD" : "ARCHIVED",
            employmentStatus: d.current ? "ACTIVE" : "TERMINATED",
            importKey: `roster:${p.key}`
          }
        });
        hireId = createdHire.id;
      } else if (rosterOwned) {
        await tx.newHire.update({
          where: { id: hireId },
          data: {
            startDate: d.start,
            birthday: d.birthday,
            department: d.department ?? undefined,
            position: d.latestPosition ?? undefined,
            ...(d.current
              ? { stage: "POST_ONBOARD", employmentStatus: "ACTIVE", terminationDate: null }
              : { stage: "ARCHIVED", employmentStatus: "TERMINATED", terminationDate: d.end })
          }
        });
      } else {
        await tx.newHire.update({ where: { id: hireId }, data: { birthday: d.birthday ?? undefined } });
      }

      if (rosterOwned) {
        await tx.employmentStint.deleteMany({ where: { newHireId: hireId } });
        for (const s of d.stints) await tx.employmentStint.create({ data: { newHireId: hireId, startDate: s.start, endDate: s.end, note: s.note } });
        const existingRoles = await tx.roleAssignment.count({ where: { newHireId: hireId } });
        if (existingRoles <= 1 && d.roles.length) {
          await tx.roleAssignment.deleteMany({ where: { newHireId: hireId } });
          for (const r of d.roles) await tx.roleAssignment.create({ data: { newHireId: hireId, title: r.title, fleetPositionSlug: r.slug, seat: r.seat, aircraft: r.aircraft, department: null, startDate: r.start, endDate: r.end, transitionType: r.transitionType } });
        }
      }
      committed++;
    });
  }

  console.log(JSON.stringify({ commit, latestYear, total, mergedIntoExisting: merged, created, rehires, withRoles, committed }, null, 2));
  if (samples.length) console.log("\n" + samples.join("\n"));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
