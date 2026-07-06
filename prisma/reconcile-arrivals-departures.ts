// Reconcile the "Arrivals & Departures" CSV against the employee (NewHire) roster:
// correct start dates from arrival rows and terminations from departure rows.
// Safe changes (start-date fixes, terminations with a valid departure date) apply
// with --commit; risky ones (reactivations, unmatched names, bad dates, ambiguous
// matches) are only REPORTED for a human.
//   npx tsx prisma/reconcile-arrivals-departures.ts            (report + preview)
//   npx tsx prisma/reconcile-arrivals-departures.ts --commit   (apply safe changes)
import { readFileSync } from "fs";
import { prisma } from "@/lib/prisma";

const FILE = "C:/Users/Recruiter/Downloads/Arrivals & Departures - Sheet1.csv";
const DAY = 24 * 60 * 60 * 1000;
const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "—");
const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/["']/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

const NICK: Record<string, string> = {
  chris: "christopher", kris: "christopher", ben: "benjamin", nick: "nicholas", nico: "nicholas", will: "william",
  bill: "william", alex: "alexander", matt: "matthew", josh: "joshua", rob: "robert", robbie: "robert", mike: "michael",
  mickey: "michael", dan: "daniel", tom: "thomas", jake: "jacob", andy: "andrew", drew: "andrew", katie: "katherine",
  joe: "joseph", jim: "james", greg: "gregory", sam: "samuel", dave: "david", steve: "steven", tony: "anthony",
  rick: "richard", ricky: "richard", rich: "richard", pat: "patrick", jon: "jonathan", zach: "zachary", nate: "nathan",
  cam: "cameron", fred: "frederick", dash: "dashiell", phil: "philip", tim: "timothy", benamin: "benjamin", jeremy: "jeremy"
};
const canonFirst = (f: string) => NICK[f] ?? f;
function related(a: string, b: string) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return true;
  return canonFirst(a) === canonFirst(b);
}

function splitLine(line: string): string[] {
  const out: string[] = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseDate(raw: string): { date: Date | null; bad: boolean } {
  const v = raw.trim();
  if (!v || /tbd/i.test(v)) return { date: null, bad: false };
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return { date: null, bad: true };
  const [, mm, dd, yy] = m;
  let year = Number(yy);
  if (yy.length === 2) year += 2000;
  if (year < 2015 || year > 2027 || Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return { date: null, bad: true };
  return { date: new Date(Date.UTC(year, Number(mm) - 1, Number(dd))), bad: false };
}

const ARRIVAL = new Set(["arrivals", "onboarding status", "archive arrivals"]);
const DEPARTURE = new Set(["departures", "offboarding status", "archive departures"]);
// A "departure" row whose position carries a transfer/move note isn't a real exit.
const TRANSFER = /moving to|transition|dedicated crew|to n4\d\d|now argus|argus qualified/i;

type Ev = { name: string; date: Date; kind: "arr" | "dep"; reliable: boolean };

function loadEvents() {
  const lines = readFileSync(FILE, "utf8").split(/\r?\n/);
  const events: Ev[] = [];
  const bad: string[] = [];
  let section = "";
  for (const line of lines) {
    const c = splitLine(line);
    const first = (c[0] ?? "").trim();
    const position = (c[1] ?? "").trim();
    const key = first.toLowerCase().replace(/\s+/g, " ").trim();
    if (ARRIVAL.has(key) || DEPARTURE.has(key) || ["changes", "archive changes"].includes(key)) { section = key; continue; }
    if (/^name$/i.test(first) || !first) continue;
    const kind = ARRIVAL.has(section) ? "arr" : DEPARTURE.has(section) ? "dep" : null;
    if (!kind) continue; // skip Changes sections
    if (kind === "dep" && TRANSFER.test(position)) continue; // a transfer, not an exit
    const { date, bad: isBad } = parseDate(c[3] ?? "");
    if (isBad) { bad.push(`${first} — "${(c[3] ?? "").trim()}" (${section})`); continue; }
    if (!date) continue;
    // Reliable termination sources are the current offboarding tracker, not the
    // transfer-mixed archive.
    const reliable = section === "departures" || section === "offboarding status";
    events.push({ name: first, date, kind, reliable });
  }
  return { events, bad };
}

async function main() {
  const commit = process.argv.includes("--commit");
  const { events, bad } = loadEvents();

  // Aggregate per person.
  type Agg = { display: string; arrivals: Date[]; departures: Date[]; reliableDep: Date[] };
  const byKey = new Map<string, Agg>();
  for (const e of events) {
    const key = norm(e.name);
    if (!key) continue;
    const a = byKey.get(key) ?? { display: e.name, arrivals: [], departures: [], reliableDep: [] };
    if (e.kind === "arr") a.arrivals.push(e.date);
    else { a.departures.push(e.date); if (e.reliable) a.reliableDep.push(e.date); }
    byKey.set(key, a);
  }

  // Index DB roster by last name.
  const rows = await prisma.newHire.findMany({
    select: { id: true, name: true, employmentStatus: true, stage: true, startDate: true, terminationDate: true,
      roleAssignments: { select: { id: true, startDate: true, endDate: true }, orderBy: { startDate: "asc" } },
      employmentStints: { select: { id: true, startDate: true, endDate: true }, orderBy: { startDate: "asc" } } }
  });
  const byLast = new Map<string, typeof rows>();
  for (const r of rows) {
    const p = norm(r.name).split(" ");
    const last = p.length > 1 ? p[p.length - 1] : "";
    const l = byLast.get(last) ?? []; l.push(r); byLast.set(last, l);
  }
  function match(name: string) {
    const p = norm(name).split(" ");
    const first = p[0] ?? "", last = p.length > 1 ? p[p.length - 1] : "";
    const cands = (byLast.get(last) ?? []).filter((r) => {
      const rp = norm(r.name).split(" ");
      return related(first, rp[0] ?? "");
    });
    return cands;
  }

  const startFixes: string[] = [], terminations: string[] = [], reactivations: string[] = [], unmatched: string[] = [], ambiguous: string[] = [], historical: string[] = [], startReview: string[] = [];
  const ops: Array<() => Promise<unknown>> = [];
  const isInferred = (x: Date | null) => (x ? ["01-01", "12-31"].includes(x.toISOString().slice(5, 10)) : true);

  for (const [, a] of byKey) {
    const cands = match(a.display);
    if (cands.length === 0) { unmatched.push(a.display); continue; }
    if (cands.length > 1) { ambiguous.push(`${a.display} → ${cands.map((c) => c.name).join(" / ")}`); continue; }
    const r = cands[0];
    const start = a.arrivals.sort((x, y) => x.getTime() - y.getTime())[0] ?? null;
    const lastArr = a.arrivals.length ? a.arrivals[a.arrivals.length - 1] : null;
    const lastDep = a.departures.sort((x, y) => x.getTime() - y.getTime())[a.departures.length - 1] ?? null;
    const lastRelDep = a.reliableDep.sort((x, y) => x.getTime() - y.getTime())[a.reliableDep.length - 1] ?? null;
    // Terminated if there's a departure that isn't superseded by a later arrival (rehire).
    const terminated = lastDep && (!lastArr || lastDep.getTime() >= lastArr.getTime()) && (!start || lastDep.getTime() >= start.getTime());
    // Only auto-apply when the exit is from the reliable offboarding tracker.
    const relTerminated = lastRelDep && (!lastArr || lastRelDep.getTime() >= lastArr.getTime()) && (!start || lastRelDep.getTime() >= start.getTime());

    // 1) Start-date correction. Apply when filling a blank/inferred date or moving
    // it EARLIER; if the CSV pushes a real start much later it's likely a rehire's
    // later stint — flag, don't clobber the original.
    if (start && (!r.startDate || Math.abs(r.startDate.getTime() - start.getTime()) > 2 * DAY)) {
      const laterByALot = r.startDate && !isInferred(r.startDate) && start.getTime() - r.startDate.getTime() > 45 * DAY;
      if (laterByALot) {
        startReview.push(`${r.name}: DB start ${d(r.startDate)} vs CSV ${d(start)} (CSV is later — rehire?)`);
      } else {
        startFixes.push(`${r.name}: start ${d(r.startDate)} → ${d(start)}`);
        const firstStint = r.employmentStints[0];
        const firstRole = r.roleAssignments[0];
        ops.push(async () => {
          await prisma.newHire.update({ where: { id: r.id }, data: { startDate: start } });
          if (firstStint) await prisma.employmentStint.update({ where: { id: firstStint.id }, data: { startDate: start } });
          if (firstRole && (firstRole.endDate === null || start.getTime() <= firstRole.endDate.getTime())) await prisma.roleAssignment.update({ where: { id: firstRole.id }, data: { startDate: start } });
        });
      }
    }

    // 2) Termination — auto-apply only from the reliable offboarding tracker.
    if (relTerminated && lastRelDep) {
      const already = r.employmentStatus === "TERMINATED" && r.terminationDate && Math.abs(r.terminationDate.getTime() - lastRelDep.getTime()) <= 2 * DAY;
      if (!already) {
        terminations.push(`${r.name}: ${r.employmentStatus}${r.terminationDate ? " " + d(r.terminationDate) : ""} → TERMINATED ${d(lastRelDep)}`);
        ops.push(async () => {
          await prisma.newHire.update({ where: { id: r.id }, data: { employmentStatus: "TERMINATED", terminationDate: lastRelDep, stage: "ARCHIVED" } });
          await prisma.roleAssignment.updateMany({ where: { newHireId: r.id, endDate: null, startDate: { lte: lastRelDep } }, data: { endDate: lastRelDep } });
          await prisma.employmentStint.updateMany({ where: { newHireId: r.id, endDate: null, startDate: { lte: lastRelDep } }, data: { endDate: lastRelDep } });
        });
      }
    } else if (terminated && lastDep && r.employmentStatus !== "TERMINATED") {
      // Only an archive-departure says they left — historical, needs a human.
      historical.push(`${r.name}: ${r.employmentStatus} → left ${d(lastDep)}? (archive departure only)`);
    }
    // 3) Reactivation (risky — report only).
    if (!terminated && r.employmentStatus === "TERMINATED") {
      reactivations.push(`${r.name}: TERMINATED ${d(r.terminationDate)} → active per CSV (arrival ${d(start)}, no departure)`);
    }
  }

  const show = (label: string, arr: string[], cap = 60) => {
    console.log(`\n${label} (${arr.length}):`);
    console.log(arr.slice(0, cap).map((s) => "  " + s).join("\n"));
    if (arr.length > cap) console.log(`  … +${arr.length - cap} more`);
  };
  console.log(`${commit ? "APPLYING SAFE CHANGES" : "DRY RUN"} — ${byKey.size} people in CSV, ${ops.length} safe op-sets`);
  show("START-DATE FIXES (apply)", startFixes);
  show("START-DATE CONFLICTS — CSV later, likely rehire (review)", startReview);
  show("TERMINATIONS (apply)", terminations);
  show("HISTORICAL DEPARTURES — archive only (review)", historical);
  show("REACTIVATIONS (review — not applied)", reactivations);
  show("AMBIGUOUS MATCHES (review)", ambiguous);
  show("BAD/TYPO DATES (review)", bad);
  show("UNMATCHED CSV NAMES — not in roster (review)", unmatched, 200);

  if (commit) { for (const op of ops) await op(); console.log(`\n✓ Applied ${ops.length} safe op-set(s).`); }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
