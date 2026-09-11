/**
 * Repairs the dates on the applications the Sheet10 import wrote.
 *
 *   npx tsx scripts/repair-paycom-sheet10-dates.ts           # dry run
 *   npx tsx scripts/repair-paycom-sheet10-dates.ts --apply   # do it
 *
 * WHY THIS EXISTS. The first run stored every applied and decided date about
 * forty-three thousand years in the future. The sheet reader hands date cells
 * over as Excel serial numbers ("April 7, 2025" arrives as 45754), the importer
 * coerced that to a string, and new Date("45754") is the YEAR 45754. The
 * candidates page then threw "RangeError: Invalid time value" trying to render
 * one, which is how it was found.
 *
 * A REPAIR RATHER THAN A RE-IMPORT, deliberately. Only two columns are wrong.
 * Deleting 5,033 people and recreating them would churn every candidate id for
 * no gain, and ids are what the manifest, the tag and any link made in the
 * meantime hang on.
 *
 * The stage chosen for each person is NOT affected and does not need redoing:
 * it was picked by sorting on those dates, and Excel serials sort in the same
 * order as the real dates, so the ordering was right even while the values were
 * not.
 *
 * Matched on Paycom's own Application ID, so it only ever touches rows this
 * import created.
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function readCsv(path: string): Array<Record<string, string>> {
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i += 1) {
    if (!lines[i].trim()) continue;
    const fields = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    header.forEach((h, j) => {
      row[h] = fields[j] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

const CSV = "C:/Users/Recruiter/Downloads/Hiring Metrics - Sheet10.csv";
const SOURCE = "Paycom hiring metrics import";

function fromExcelSerial(n: number): Date | null {
  if (!Number.isFinite(n) || n <= 0 || n > 80000) return null;
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
}

function parseDate(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === "number") return fromExcelSerial(raw);
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return fromExcelSerial(Number(s));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Safe for a date Postgres accepted but JS cannot serialise. */
function show(d: Date | null): string {
  if (!d) return "null";
  try {
    return d.toISOString().slice(0, 10);
  } catch {
    return "(unserialisable)";
  }
}

async function main() {
  const apply = process.argv.includes("--apply");

  // Read as TEXT, with no spreadsheet library — the same rule the importer now
  // follows, and for the same reason: handing a CSV to xlsx is what turned
  // "April 7, 2025" into the serial 45754 and caused the damage this repairs.
  const rows = readCsv(CSV);

  const correct = new Map<string, { appliedAt: Date | null; decidedAt: Date | null }>();
  for (const r of rows) {
    const id = String(r["Application ID"] ?? "").trim();
    if (!id) continue;
    correct.set(id, {
      appliedAt: parseDate(r["Application Date"]),
      decidedAt: parseDate(r["Disposition Date"])
    });
  }
  console.log(`Correct dates read from the export for ${correct.size} applications.`);

  const stored = await prisma.candidateApplication.findMany({
    where: { source: SOURCE },
    select: { id: true, sourceApplicationId: true, appliedAt: true, decidedAt: true }
  });
  console.log(`Applications from this import in the database: ${stored.length}`);

  const fixes: Array<{ id: string; appliedAt: Date | null; decidedAt: Date | null }> = [];
  let alreadyRight = 0;
  let noSource = 0;
  for (const s of stored) {
    if (!s.sourceApplicationId) {
      noSource += 1;
      continue;
    }
    const want = correct.get(s.sourceApplicationId);
    if (!want) continue;
    const sameApplied = s.appliedAt?.getTime() === want.appliedAt?.getTime();
    const sameDecided = s.decidedAt?.getTime() === want.decidedAt?.getTime();
    if (sameApplied && sameDecided) {
      alreadyRight += 1;
      continue;
    }
    fixes.push({ id: s.id, appliedAt: want.appliedAt, decidedAt: want.decidedAt });
  }

  console.log(`  already correct:      ${alreadyRight}`);
  console.log(`  to be corrected:      ${fixes.length}`);
  console.log(`  no Paycom id on them: ${noSource}`);
  console.log("");
  console.log("First 8 changes:");
  for (const f of fixes.slice(0, 8)) {
    const before = stored.find((s) => s.id === f.id)!;
    console.log(
      `  ${before.sourceApplicationId}: applied ${show(before.appliedAt)} -> ${show(f.appliedAt)}` +
        ` | decided ${show(before.decidedAt)} -> ${show(f.decidedAt)}`
    );
  }

  if (!apply) {
    console.log("");
    console.log("DRY RUN — nothing written. Re-run with --apply.");
    return;
  }

  let done = 0;
  for (const f of fixes) {
    await prisma.candidateApplication.update({
      where: { id: f.id },
      data: { appliedAt: f.appliedAt, decidedAt: f.decidedAt }
    });
    done += 1;
    if (done % 1000 === 0) console.log(`  repaired ${done}...`);
  }
  console.log(`\nRepaired ${done} applications.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
