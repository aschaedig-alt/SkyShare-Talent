// Import the "Pilot Upgrade Tracker" CSV into employee role journeys.
// Each row = one employee: an initial role (Airframe/Seat/Start Date) plus up to
// two recorded transitions (New Airframe/New Seat/Upgrade Date). We match the
// person by name to an existing NewHire and REPLACE their role history with the
// tracker's chain (the tracker is authoritative for the journey).
//
//   npx tsx prisma/import-pilot-upgrades.ts                         (dry run, all)
//   npx tsx prisma/import-pilot-upgrades.ts --only "Mark Harris,Robert Allen"
//   npx tsx prisma/import-pilot-upgrades.ts --commit --only "Mark Harris,Robert Allen"
//   npx tsx prisma/import-pilot-upgrades.ts --commit                (write all matched)

import { readFileSync } from "fs";
import { prisma } from "@/lib/prisma";
import { resolveFleetPosition } from "@/lib/fleet/positions";

const FILE = "C:/Users/Recruiter/Downloads/Pilot Upgrade Tracker - Sheet1.csv";

// --- tiny RFC-4180-ish splitter (handles quoted fields) ---
function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const clean = (s: string | undefined) => {
  const v = (s ?? "").trim();
  return v && !/^#n\/a$/i.test(v) ? v : "";
};

function parseDate(s: string): Date | null {
  const v = clean(s);
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const normName = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

const AIRFRAME: Record<string, string> = {
  xl: "560XL", ce525: "CE-525", "ce-525": "CE-525", g450: "G450", g200: "G200",
  "pc-12": "PC-12", pc12: "PC-12", m2: "M2", phenom: "Phenom 100",
  "legacy 600": "Legacy 600", "legacy 650": "Legacy 650"
};

function airframeLabel(raw: string): string {
  const v = clean(raw);
  if (!v) return "";
  return AIRFRAME[v.toLowerCase()] ?? v;
}

function seatLabel(raw: string): "Captain" | "First Officer" | "" {
  const v = clean(raw).toUpperCase();
  if (v === "PIC") return "Captain";
  if (v === "SIC") return "First Officer";
  return "";
}

type Step = { airframe: string; seat: string; date: Date | null; rawAirframe: string; rawSeat: string };

// Build a role title + resolved fleet fields from an airframe + seat.
function roleFrom(af: string, seatRaw: string) {
  const seat = seatLabel(seatRaw);
  const title = [airframeLabel(af), seat].filter(Boolean).join(" ").trim() || "Pilot";
  const fp = resolveFleetPosition(title);
  const seatCode = fp?.seat ?? (seatRaw.toUpperCase() === "PIC" ? "PIC" : seatRaw.toUpperCase() === "SIC" ? "SIC" : null);
  return { title: fp?.title ?? title, slug: fp?.slug ?? null, seat: seatCode, aircraft: fp?.aircraft ?? (airframeLabel(af) || null) };
}

function transitionType(prevSeat: string | null, seat: string | null): string {
  if (prevSeat === "SIC" && seat === "PIC") return "UPGRADE";
  return "PROMOTION"; // airframe/role move (the tracker counts these as progressions)
}

async function main() {
  const commit = process.argv.includes("--commit");
  const onlyArg = process.argv.find((a, i) => process.argv[i - 1] === "--only");
  const only = onlyArg ? onlyArg.split(",").map((s) => normName(s)) : null;

  const lines = readFileSync(FILE, "utf8").split(/\r?\n/);
  const rows = lines.slice(1).map(splitLine).filter((c) => clean(c[1])); // must have a Name

  const create = process.argv.includes("--create");
  const existing = await prisma.newHire.findMany({ select: { id: true, name: true, terminationDate: true, employmentStatus: true, importKey: true } });
  const byName = new Map(existing.map((h) => [normName(h.name), h]));
  const byKey = new Map(existing.filter((h) => h.importKey).map((h) => [h.importKey as string, h]));

  let parsed = 0, matched = 0, unmatched = 0, withUpgrades = 0, committed = 0, created = 0;
  const samples: string[] = [];
  const unmatchedNames: string[] = [];

  for (const c of rows) {
    const name = clean(c[1]);
    if (only && !only.includes(normName(name))) continue;
    parsed++;

    // Build the ordered step list: initial + up to two transitions.
    const steps: Step[] = [];
    const initialDate = parseDate(c[5]) ?? parseDate(c[2]); // Start Date, else Hire Date
    if (clean(c[3]) || clean(c[4])) steps.push({ airframe: c[3], seat: c[4], date: initialDate, rawAirframe: clean(c[3]), rawSeat: clean(c[4]) });
    else if (initialDate) steps.push({ airframe: "", seat: "", date: initialDate, rawAirframe: "", rawSeat: "" }); // pilot, unknown seat
    if ((clean(c[6]) || clean(c[7])) && parseDate(c[8])) steps.push({ airframe: c[6], seat: c[7], date: parseDate(c[8]), rawAirframe: clean(c[6]), rawSeat: clean(c[7]) });
    if ((clean(c[10]) || clean(c[11])) && parseDate(c[12])) steps.push({ airframe: c[10], seat: c[11], date: parseDate(c[12]), rawAirframe: clean(c[10]), rawSeat: clean(c[11]) });

    if (steps.length > 1) withUpgrades++;

    const code = clean(c[0]);
    const importKey = code ? `upgrade-tracker:${code}` : null;
    const hire = byName.get(normName(name)) ?? (importKey ? byKey.get(importKey) : undefined);
    let willCreate = false;
    if (!hire) {
      unmatched++;
      unmatchedNames.push(name);
      if (!create) continue;
      willCreate = true;
    } else {
      matched++;
    }

    // Build role assignments from the step chain.
    const roles = steps.map((s, i) => {
      const r = roleFrom(s.airframe, s.seat);
      const start = s.date;
      const end = i < steps.length - 1 ? steps[i + 1].date : hire?.employmentStatus === "TERMINATED" ? hire.terminationDate ?? null : null;
      const prevSeat = i > 0 ? roleFrom(steps[i - 1].airframe, steps[i - 1].seat).seat : null;
      return { title: r.title, fleetPositionSlug: r.slug, seat: r.seat, aircraft: r.aircraft, startDate: start, endDate: end, transitionType: i === 0 ? "HIRE" : transitionType(prevSeat, r.seat) };
    }).filter((r) => r.startDate);

    if (normName(name) === "mark harris" || normName(name) === "robert allen" || (only && only.length <= 3)) {
      samples.push(`${name}: ` + roles.map((r) => `${r.title} [${r.transitionType}] ${r.startDate ? r.startDate.toISOString().slice(0, 10) : "?"}→${r.endDate ? r.endDate.toISOString().slice(0, 10) : "present"}`).join("  |  "));
    }

    if (commit && roles.length) {
      await prisma.$transaction(async (tx) => {
        let hireId = hire?.id;
        if (willCreate) {
          const createdHire = await tx.newHire.create({
            data: { name, startDate: steps[0]?.date ?? null, position: roles[roles.length - 1].title, stage: "POST_ONBOARD", employmentStatus: "ACTIVE", importKey }
          });
          hireId = createdHire.id;
        } else {
          await tx.roleAssignment.deleteMany({ where: { newHireId: hireId! } });
        }
        for (const r of roles) {
          await tx.roleAssignment.create({ data: { newHireId: hireId!, title: r.title, fleetPositionSlug: r.fleetPositionSlug, seat: r.seat, aircraft: r.aircraft, department: null, startDate: r.startDate!, endDate: r.endDate, transitionType: r.transitionType } });
        }
        await tx.newHire.update({ where: { id: hireId! }, data: { position: roles[roles.length - 1].title } });
      });
      if (willCreate) created++; else committed++;
    }
  }

  console.log(JSON.stringify({ commit, create, only: only ?? "ALL", parsed, matched, unmatched, withUpgrades, committed, created }, null, 2));
  if (samples.length) console.log("\nSAMPLES:\n" + samples.join("\n"));
  if (!only && unmatchedNames.length) console.log(`\nUNMATCHED (${unmatchedNames.length}): ${unmatchedNames.slice(0, 30).join(", ")}${unmatchedNames.length > 30 ? " …" : ""}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
