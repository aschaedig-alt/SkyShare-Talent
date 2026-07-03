// Fill in / add dated position changes from the "Recruiting Status Tracking —
// Training Info" CSV. A training START date ≈ when a pilot stepped into that new
// seat, so it dates the transitions the Upgrade Tracker left blank (and adds
// ones nobody recorded). For each matched pilot we rebuild their role journey
// from: their hire anchor + every KNOWN transition (existing tracker roles +
// training rows), keyed by role title (training date preferred), sorted by date.
//
//   npx tsx prisma/import-training-transitions.ts               (dry run + stats)
//   npx tsx prisma/import-training-transitions.ts --sample "Kylee Madsen"
//   npx tsx prisma/import-training-transitions.ts --commit

import { readFileSync } from "fs";
import { prisma } from "@/lib/prisma";
import { resolveFleetPosition } from "@/lib/fleet/positions";

const FILE = "C:/Users/Recruiter/Downloads/Recruiting Status Tracking - Training Info.csv";
const DAY = 24 * 60 * 60 * 1000;

function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
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

const clean = (v: unknown) => String(v ?? "").trim();
const normName = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();

// Known name variants in the training sheet -> canonical roster name.
const ALIASES: Record<string, string> = {
  "chris holiday": "chris holladay",
  "brian thomas": "bryan thomas",
  "jermey mcgraw": "jeremy mcgraw",
  "robbie allen": "robert allen",
  "ben houston": "benjamin houston",
  "will page": "william page",
  "nick charles": "nicholas charles",
  "teren christenson": "teren christensen",
  "matt dahle": "matthew dahle",
  "ben butler": "benjamin butler",
  "josh thompson": "joshua thompson",
  "alex andrade": "alexander andrade",
  "katie bright": "caiden bright",
  "ren stephani": "ren carter",
  "nick nadolski": "nick nadolski"
};
function canonName(raw: string): string {
  const n = normName(raw.replace(/\(.*?\)/g, "")); // drop parentheticals like "(Was Nick Smout)"
  return ALIASES[n] ?? n;
}

function parseDate(s: string): Date | null {
  let v = clean(s);
  if (!v || /^(n\/a|tbd|in progress|done|contract|\?)/i.test(v)) return null;
  v = v.replace(/\(\?\)/g, "").trim();
  const range = v.match(/^(\d{1,2}\/\d{1,2})(?:-\d)/); // "11/17-11/21" -> take first, needs a year though
  if (range) return null; // ambiguous year — skip
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Parse a training "Position" (e.g. "PC-12 Captain", "CJ2 FO", "G450 F/O",
// "XL & CJ2 Captain") into a canonical role title + seat. Returns null when the
// airframe or seat can't be read confidently.
function parseRole(raw: string): { title: string; seat: "PIC" | "SIC"; slug: string | null; aircraft: string | null } | null {
  const t = clean(raw).toLowerCase();
  if (!t) return null;
  const lead = /\blead\b/.test(t);
  let seat: "PIC" | "SIC" | null = null;
  if (/\b(sic|f\/?o|first officer)\b/.test(t)) seat = "SIC";
  else if (/\b(pic|captain|capt)\b/.test(t)) seat = "PIC";
  if (!seat) return null;

  const AF: Array<[RegExp, string]> = [
    [/\bg450\b/, "G450"], [/\bg200\b/, "G200"], [/\blegacy ?650\b/, "Legacy 650"],
    [/\bpc-?12\b/, "PC-12"], [/\bphenom ?300\b/, "Phenom 300"], [/\bphenom\b/, "Phenom 100"],
    [/\b560 ?xls\+?\b|\bxls\+?\b/, "560XLS+"], [/\bxl\b/, "560XL"], [/\bcj ?2\b/, "CJ2"], [/\bm2\b/, "M2"], [/\bce-?525\b/, "CE-525"]
  ];
  let aircraft: string | null = null;
  for (const [re, name] of AF) { if (re.test(t)) { aircraft = name; break; } }
  if (!aircraft) return null;

  const seatWord = lead && seat === "PIC" ? "Lead Captain" : seat === "PIC" ? "Captain" : "First Officer";
  const title = `${aircraft} ${seatWord}`;
  const fp = resolveFleetPosition(title);
  return { title: fp?.title ?? title, seat: fp?.seat ?? seat, slug: fp?.slug ?? null, aircraft: fp?.aircraft ?? aircraft };
}

type Training = { title: string; seat: "PIC" | "SIC"; slug: string | null; aircraft: string | null; date: Date };
type PersonRec = { trainings: Training[]; startDate: Date | null; hireRole: Training | null; display: string };

function loadTrainings(): Map<string, PersonRec> {
  const lines = readFileSync(FILE, "utf8").split(/\r?\n/);
  const byPerson = new Map<string, PersonRec>();
  for (const line of lines.slice(1)) {
    const c = splitLine(line);
    const name = clean(c[0]);
    if (!name || /^archived$/i.test(name)) continue;
    const key = canonName(name);
    const display = name.replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim();
    const rec = byPerson.get(key) ?? { trainings: [], startDate: null, hireRole: null, display };
    const role = parseRole(c[3]);
    const date = parseDate(c[7]); // Training Start Date
    const start = parseDate(c[4]); // Start Date (hire) — present for external new hires
    if (start && (!rec.startDate || start < rec.startDate)) {
      rec.startDate = start;
      if (role) rec.hireRole = { ...role, date: start };
    }
    if (role && date) rec.trainings.push({ ...role, date });
    byPerson.set(key, rec);
  }
  return byPerson;
}

const normTitle = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();

async function main() {
  const commit = process.argv.includes("--commit");
  const sampleArg = process.argv.find((a, i) => process.argv[i - 1] === "--sample");
  const sample = sampleArg ? canonName(sampleArg) : null;

  const trainings = loadTrainings();
  const existing = await prisma.newHire.findMany({
    select: { id: true, name: true, startDate: true, roleAssignments: { select: { title: true, seat: true, startDate: true, endDate: true, transitionType: true, fleetPositionSlug: true, aircraft: true } } }
  });
  const byName = new Map(existing.map((h) => [normName(h.name), h]));

  type R = { title: string; seat: string | null; slug: string | null; aircraft: string | null; date: Date; isHire: boolean };
  const roleData = (hireId: string, r: R, end: Date | null, tt: string) => ({ newHireId: hireId, title: r.title, fleetPositionSlug: r.slug, seat: r.seat, aircraft: r.aircraft, department: null, startDate: r.date, endDate: end, transitionType: tt });
  const chain = (seq: R[]) => {
    let prevSeat: string | null = null;
    return seq.map((r, i) => {
      const end = i < seq.length - 1 ? seq[i + 1].date : null;
      const tt = i === 0 ? "HIRE" : prevSeat === "SIC" && r.seat === "PIC" ? "UPGRADE" : "PROMOTION";
      if (r.seat) prevSeat = r.seat;
      return { r, end, tt };
    });
  };

  let people = 0, matched = 0, created = 0, updated = 0, added = 0;
  const unmatched: string[] = [];
  const samples: string[] = [];

  for (const [key, rec] of trainings) {
    people++;
    const trs = [...rec.trainings].sort((a, b) => a.date.getTime() - b.date.getTime());
    const hire = byName.get(key);

    // Seed the role map with an anchor: existing journey (matched) or the hire
    // role from the training sheet (new person). Training rows then fill/add,
    // preferring the training date but never moving the HIRE role.
    const map = new Map<string, R>();
    if (hire) {
      for (const r of hire.roleAssignments) {
        if (!r.startDate) continue;
        map.set(normTitle(r.title), { title: r.title, seat: r.seat, slug: r.fleetPositionSlug, aircraft: r.aircraft, date: r.startDate, isHire: r.transitionType === "HIRE" });
      }
    } else if (rec.hireRole) {
      const h = rec.hireRole;
      map.set(normTitle(h.title), { title: h.title, seat: h.seat, slug: h.slug, aircraft: h.aircraft, date: rec.startDate ?? h.date, isHire: true });
    }
    for (const t of trs) {
      const k = normTitle(t.title);
      if (map.get(k)?.isHire) continue;
      map.set(k, { title: t.title, seat: t.seat, slug: t.slug, aircraft: t.aircraft, date: t.date, isHire: false });
    }
    const seq = [...map.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
    if (!seq.length) { if (!hire) unmatched.push(key); continue; }
    if (!seq.some((r) => r.isHire)) seq[0].isHire = true;

    if (!hire) {
      // New person from the training sheet — create them (needs a start date).
      if (!rec.startDate) { unmatched.push(key); continue; }
      created++;
      if (sample && key === sample) { samples.push(`${rec.display} [CREATE]:`); for (const r of seq) samples.push(`  ${r.title} [${r.isHire ? "HIRE" : r.seat}] ${r.date.toISOString().slice(0, 10)}`); }
      if (!commit) continue;
      await prisma.$transaction(async (tx) => {
        const nh = await tx.newHire.create({ data: { name: rec.display, startDate: seq[0].date, position: seq[seq.length - 1].title, stage: "POST_ONBOARD", employmentStatus: "ACTIVE", importKey: `training:${key}` } });
        for (const { r, end, tt } of chain(seq)) await tx.roleAssignment.create({ data: roleData(nh.id, r, end, tt) });
      });
      continue;
    }

    matched++;
    const before = hire.roleAssignments.length;
    const changed = seq.length !== before || trs.some((t) => !hire.roleAssignments.some((r) => normTitle(r.title) === normTitle(t.title) && r.startDate && Math.abs(r.startDate.getTime() - t.date.getTime()) < DAY));
    if (seq.length > before) added++;
    if (changed) updated++;

    if (sample && key === sample) {
      samples.push(`${hire.name}:`);
      for (const r of seq) samples.push(`  ${r.title} [${r.isHire ? "HIRE" : r.seat}] ${r.date.toISOString().slice(0, 10)}`);
    }

    if (!commit || !changed) continue;
    await prisma.$transaction(async (tx) => {
      await tx.roleAssignment.deleteMany({ where: { newHireId: hire.id } });
      for (const { r, end, tt } of chain(seq)) await tx.roleAssignment.create({ data: roleData(hire.id, r, end, tt) });
      await tx.newHire.update({ where: { id: hire.id }, data: { position: seq[seq.length - 1].title } });
    });
  }

  console.log(JSON.stringify({ commit, trainingPeople: people, matched, created, unmatched: unmatched.length, journeysChanged: updated, journeysGainedRoles: added }, null, 2));
  if (samples.length) console.log("\n" + samples.join("\n"));
  if (!sample && unmatched.length) console.log(`\nUNMATCHED (${unmatched.length}): ${unmatched.slice(0, 40).join(", ")}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
