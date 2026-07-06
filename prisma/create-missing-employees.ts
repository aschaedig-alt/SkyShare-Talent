// Create employees that appear in the Arrivals & Departures CSV but aren't in the
// roster — the genuinely-new hires (mostly non-pilots earlier imports skipped).
// Guards hard against re-creating someone who already exists under a spelling/
// nickname variant (fuzzy last-name match + known aliases), and skips non-people
// and rows with no usable start date. Idempotent via importKey `arrivals-csv:<name>`.
//   npx tsx prisma/create-missing-employees.ts            (preview)
//   npx tsx prisma/create-missing-employees.ts --commit   (apply)
import { readFileSync } from "fs";
import { prisma } from "@/lib/prisma";
import { resolveFleetPosition } from "@/lib/fleet/positions";

const FILE = "C:/Users/Recruiter/Downloads/Arrivals & Departures - Sheet1.csv";
const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "—");
const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/["']/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

const NICK: Record<string, string> = {
  chris: "christopher", ben: "benjamin", nick: "nicholas", nico: "nicholas", will: "william", alex: "alexander",
  matt: "matthew", josh: "joshua", rob: "robert", mike: "michael", dan: "daniel", tom: "thomas", jake: "jacob",
  andy: "andrew", drew: "andrew", joe: "joseph", jim: "james", greg: "gregory", sam: "samuel", dave: "david",
  steve: "steven", rick: "richard", pat: "patrick", jon: "jonathan", zach: "zachary", cam: "cameron",
  jd: "jd", benamin: "benjamin"
};
const canonFirst = (f: string) => NICK[f] ?? f;
function related(a: string, b: string) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return true;
  return canonFirst(a) === canonFirst(b);
}
function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[m][n];
}

// Known name-change / spelling variants that a fuzzy match can't catch.
const ALIAS = new Set(["ren stephani", "katie bright", "alvaro martin"]);
// Non-people / never-started rows to skip outright.
const SKIP = /planet synergy/i;

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
function parseDate(raw: string): Date | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const [, mm, dd, yy] = m;
  const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
  if (year < 2015 || year > 2027 || +mm < 1 || +mm > 12 || +dd < 1 || +dd > 31) return null;
  return new Date(Date.UTC(year, +mm - 1, +dd));
}
const cleanPos = (p: string) => p.replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim() || null;
const seatOf = (t: string) => (/\b(sic|f\/?o|first officer)\b/i.test(t) ? "SIC" : /\b(pic|captain|capt|lead)\b/i.test(t) ? "PIC" : null);

const ARRIVAL = new Set(["arrivals", "onboarding status", "archive arrivals"]);
const DEPARTURE = new Set(["departures", "offboarding status", "archive departures"]);
const TRANSFER = /moving to|transition|dedicated crew|to n4\d\d|argus/i;

type Person = { display: string; position: string | null; arrivals: Date[]; reliableDep: Date[]; anyDep: Date[] };

function loadPeople() {
  const lines = readFileSync(FILE, "utf8").split(/\r?\n/);
  const map = new Map<string, Person>();
  let section = "";
  for (const line of lines) {
    const c = splitLine(line);
    const first = (c[0] ?? "").trim();
    const key = first.toLowerCase().replace(/\s+/g, " ").trim();
    if (ARRIVAL.has(key) || DEPARTURE.has(key) || ["changes", "archive changes"].includes(key)) { section = key; continue; }
    if (/^name$/i.test(first) || !first) continue;
    const kind = ARRIVAL.has(section) ? "arr" : DEPARTURE.has(section) ? "dep" : null;
    if (!kind) continue;
    const position = (c[1] ?? "").trim();
    if (kind === "dep" && TRANSFER.test(position)) continue;
    const date = parseDate(c[3] ?? "");
    if (!date) continue;
    const nkey = norm(first);
    if (!nkey) continue;
    const p = map.get(nkey) ?? { display: first, position: null, arrivals: [], reliableDep: [], anyDep: [] };
    if (kind === "arr") { p.arrivals.push(date); if (!p.position && position) p.position = position; }
    else { p.anyDep.push(date); if (section === "departures" || section === "offboarding status") p.reliableDep.push(date); }
    map.set(nkey, p);
  }
  return map;
}

async function main() {
  const commit = process.argv.includes("--commit");
  const people = loadPeople();

  const rows = await prisma.newHire.findMany({ select: { id: true, name: true, importKey: true } });
  const dbMeta = rows.map((r) => { const p = norm(r.name).split(" "); return { name: r.name, importKey: r.importKey, first: p[0] ?? "", last: p.length > 1 ? p[p.length - 1] : "" }; });

  function existing(name: string): string | null {
    const p = norm(name).split(" ");
    const first = p[0] ?? "", last = p.length > 1 ? p[p.length - 1] : "";
    if (ALIAS.has(norm(name))) return "known alias";
    for (const r of dbMeta) {
      if (!last || !r.last) continue;
      const lastClose = r.last === last || lev(r.last, last) <= 1;
      const firstClose = related(first, r.first) || r.first.slice(0, 3) === first.slice(0, 3) || lev(r.first, first) <= 1;
      if (lastClose && firstClose) return r.name;
    }
    return null;
  }

  const toCreate: { p: Person; start: Date; terminated: boolean; term: Date | null }[] = [];
  const skipExisting: string[] = [], skipNoStart: string[] = [], skipOther: string[] = [];

  for (const [key, p] of people) {
    if (SKIP.test(p.display) || `arrivals-csv:${key}`.length > 300) { skipOther.push(p.display); continue; }
    const ex = existing(p.display);
    if (ex) { skipExisting.push(`${p.display} → ${ex}`); continue; }
    const start = p.arrivals.sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    if (!start) { skipNoStart.push(`${p.display} (only departure rows)`); continue; }
    const lastArr = p.arrivals[p.arrivals.length - 1];
    const lastRel = p.reliableDep.sort((a, b) => a.getTime() - b.getTime())[p.reliableDep.length - 1] ?? null;
    const terminated = !!(lastRel && lastRel.getTime() >= lastArr.getTime());
    toCreate.push({ p, start, terminated, term: terminated ? lastRel : null });
  }

  console.log(`${commit ? "CREATING" : "DRY RUN"} — ${toCreate.length} new employee(s); skipping ${skipExisting.length} existing, ${skipNoStart.length} no-start, ${skipOther.length} other\n`);
  for (const { p, start, terminated, term } of toCreate) {
    console.log(`  + ${p.display} · ${cleanPos(p.position ?? "") ?? "—"} · start ${d(start)}${terminated ? ` · TERMINATED ${d(term)}` : ""}`);
    if (!commit) continue;
    const key = norm(p.display);
    const title = cleanPos(p.position ?? "");
    const fp = title ? resolveFleetPosition(title) : null;
    const seat = fp?.seat ?? (title ? seatOf(title) : null);
    await prisma.$transaction(async (tx) => {
      const nh = await tx.newHire.create({ data: {
        name: p.display, position: title, startDate: start,
        stage: terminated ? "ARCHIVED" : "POST_ONBOARD",
        employmentStatus: terminated ? "TERMINATED" : "ACTIVE",
        terminationDate: term, importKey: `arrivals-csv:${key}`
      } });
      if (title) await tx.roleAssignment.create({ data: { newHireId: nh.id, title: fp?.title ?? title, fleetPositionSlug: fp?.slug ?? null, seat, aircraft: fp?.aircraft ?? null, startDate: start, endDate: term, transitionType: "HIRE" } });
      await tx.employmentStint.create({ data: { newHireId: nh.id, startDate: start, endDate: term } });
    });
  }
  const show = (label: string, arr: string[]) => { if (arr.length) { console.log(`\n${label} (${arr.length}):`); console.log(arr.map((s) => "  " + s).join("\n")); } };
  show("SKIPPED — already exists (variant)", skipExisting);
  show("SKIPPED — no start date", skipNoStart);
  show("SKIPPED — non-person", skipOther);
  if (commit) console.log(`\n✓ Created ${toCreate.length} employee(s).`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
