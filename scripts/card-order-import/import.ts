/**
 * Import the business-card ORDER history out of the orders workbook.
 *
 *   npx tsx scripts/card-order-import/import.ts --file "<path to .xlsx>"            # dry run, writes a review file
 *   npx tsx scripts/card-order-import/import.ts --file "<path>" --apply --limit 1   # smallest real batch first
 *   npx tsx scripts/card-order-import/import.ts --file "<path>" --apply             # the rest
 *   npx tsx scripts/card-order-import/import.ts --undo                              # remove exactly what was written
 *
 * Reads the DataStatus tab: Date Cards Ordered | Employee's Name | Date received |
 * Order Received By | Date Distributed. Received-by and Distributed are ignored on
 * purpose - they are empty on all 71 lines, and the after-order steps are a
 * separate decision that has been deferred.
 *
 * ONLY CREATES. It never updates a NewHire and never touches businessCardStatus.
 * Every id it writes is recorded in UNDO.json so the whole import can be lifted
 * back out in one command.
 */
import { prisma } from "@/lib/prisma";
import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";

// xlsx is CommonJS; under tsx's ESM loader the namespace import has no readFile
// on it, so require it explicitly rather than relying on interop.
const XLSX = createRequire(import.meta.url)("xlsx") as typeof import("xlsx");

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const UNDO = path.join(HERE, "UNDO.json");
const REVIEW = path.join(HERE, "review.md");

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const val = (f: string) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};
const APPLY = has("--apply");
const UNDO_MODE = has("--undo");
const LIMIT = val("--limit") ? Number(val("--limit")) : null;

/** Strip zero-width characters and collapse whitespace. 12 of the 71 name cells need this. */
const clean = (s: unknown) => String(s ?? "").replace(/[​-‍﻿]/g, "").replace(/\s+/g, " ").trim();
const key = (s: unknown) => clean(s).toLowerCase();

/** The sheet writes dates as m/d/yyyy text. Anything else (e.g. a bare "2026") stays a label. */
function toDate(v: unknown): Date | null {
  const t = clean(v);
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2])));
}

// Nicknames the sheet uses that the roster does not. Kept explicit rather than
// fuzzy-matched: a wrong guess here silently attributes somebody else's cards.
const ALIASES: Record<string, string> = {
  "rich vance": "richard vance"
};

// Not people. They keep their line (the order really happened) with a null hire.
const NOT_A_PERSON = new Set(["south valley regional"]);

type Line = { name: string; matchKey: string };
type Batch = {
  orderedOn: Date | null;
  orderedLabel: string | null;
  receivedOn: Date | null;
  receivedLabel: string | null;
  lines: Line[];
};

async function undo() {
  if (!fs.existsSync(UNDO)) {
    console.log("Nothing to undo - " + UNDO + " does not exist.");
    return;
  }
  const rec = JSON.parse(fs.readFileSync(UNDO, "utf8")) as { orderIds: string[]; lineIds: string[] };
  const linesBefore = await prisma.businessCardOrderLine.count({ where: { id: { in: rec.lineIds } } });
  const ordersBefore = await prisma.businessCardOrder.count({ where: { id: { in: rec.orderIds } } });
  console.log("Found " + linesBefore + " of " + rec.lineIds.length + " lines and " + ordersBefore + " of " + rec.orderIds.length + " orders still present.");
  // Lines cascade from the order, but delete them explicitly so the count is honest.
  const dl = await prisma.businessCardOrderLine.deleteMany({ where: { id: { in: rec.lineIds } } });
  const do_ = await prisma.businessCardOrder.deleteMany({ where: { id: { in: rec.orderIds } } });
  console.log("Deleted " + dl.count + " lines and " + do_.count + " orders.");
  fs.unlinkSync(UNDO);
  console.log("Removed " + UNDO + ".");
}

async function main() {
  if (UNDO_MODE) return undo();

  const file = val("--file");
  if (!file) throw new Error("--file <path to the orders .xlsx> is required");

  const wb = XLSX.readFile(file, { cellDates: true });
  if (!wb.Sheets.DataStatus) throw new Error("No DataStatus tab in " + file);
  const rows = (XLSX.utils.sheet_to_json(wb.Sheets.DataStatus, { header: 1, raw: false, defval: null }) as (string | null)[][])
    .filter((r) => r.some((c) => c !== null && String(c).trim() !== ""));

  const header = rows[0].map((c) => clean(c));
  const EXPECTED = ["Date Cards Ordered", "Employee's Name"];
  for (const e of EXPECTED) {
    if (!header.some((h) => h.toLowerCase() === e.toLowerCase())) {
      throw new Error("DataStatus header does not look right - expected a '" + e + "' column, got: " + header.join(" | "));
    }
  }

  // Group into batches by the raw ordered cell. That cell IS the batch key: every
  // person ordered on the same day went to the printer together.
  const batches = new Map<string, Batch>();
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const name = clean(r[1]);
    if (!name) { skipped++; continue; }
    const orderedLabel = clean(r[0]) || null;
    const k = orderedLabel ?? "(undated)";
    let b = batches.get(k);
    if (!b) {
      b = { orderedOn: toDate(r[0]), orderedLabel, receivedOn: null, receivedLabel: null, lines: [] };
      batches.set(k, b);
    }
    const rec = clean(r[2]);
    if (rec && !b.receivedOn && !b.receivedLabel) {
      b.receivedOn = toDate(r[2]);
      if (!b.receivedOn) b.receivedLabel = rec;
    }
    const kk = key(name);
    b.lines.push({ name, matchKey: ALIASES[kk] ?? kk });
  }

  // Resolve people. Exact name match on the cleaned name, nothing fuzzy.
  const hires = await prisma.newHire.findMany({ select: { id: true, name: true } });
  const byName = new Map(hires.map((h) => [key(h.name), h]));
  console.log("roster loaded: " + hires.length + " NewHire rows (positive control - a zero here would be my bug, not their data)");

  const ordered = [...batches.values()].sort((a, b) => {
    if (a.orderedOn && b.orderedOn) return a.orderedOn.getTime() - b.orderedOn.getTime();
    if (a.orderedOn) return -1;
    if (b.orderedOn) return 1;
    return 0;
  });

  let matched = 0;
  const unmatched: string[] = [];
  const report: string[] = [];
  report.push("# Business-card order import - review", "");
  report.push("Source: " + file, "");
  report.push("| Ordered | People | Received | Matched | Not matched |");
  report.push("| --- | --- | --- | --- | --- |");
  for (const b of ordered) {
    let m = 0;
    const miss: string[] = [];
    for (const l of b.lines) {
      if (byName.has(l.matchKey)) { m++; matched++; }
      else { miss.push(l.name); if (!NOT_A_PERSON.has(l.matchKey)) unmatched.push(l.name); }
    }
    report.push("| " + (b.orderedLabel ?? "(undated)") + " | " + b.lines.length + " | " +
      (b.receivedOn ? b.receivedOn.toISOString().slice(0, 10) : (b.receivedLabel ?? "-")) + " | " +
      m + " | " + (miss.length ? miss.join(", ") : "-") + " |");
  }
  const totalLines = ordered.reduce((n, b) => n + b.lines.length, 0);
  report.push("", "Batches: " + ordered.length, "Lines: " + totalLines,
    "Matched to a person: " + matched, "Unmatched: " + (totalLines - matched),
    "Blank name rows skipped: " + skipped);

  // Repeat orders - the thing the single status field cannot hold.
  const per = new Map<string, number>();
  for (const b of ordered) for (const l of b.lines) per.set(l.matchKey, (per.get(l.matchKey) ?? 0) + 1);
  const repeats = [...per.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]);
  report.push("", "## Ordered more than once", "");
  for (const [k, c] of repeats) report.push("- " + k + " x" + c);

  fs.writeFileSync(REVIEW, report.join("\n"));
  console.log("\n" + report.slice(2).join("\n"));
  console.log("\nreview written to " + REVIEW);

  const already = await prisma.businessCardOrder.count({ where: { source: "SHEET_IMPORT" } });
  if (already > 0) {
    console.log("\n*** " + already + " SHEET_IMPORT orders already exist. Run --undo first, or this would duplicate them. Stopping.");
    return;
  }

  if (!APPLY) {
    console.log("\nDRY RUN - nothing written. Re-run with --apply (and --limit 1 for the first batch only).");
    return;
  }

  const todo = LIMIT ? ordered.slice(0, LIMIT) : ordered;
  console.log("\nWriting " + todo.length + " of " + ordered.length + " batches...");

  const rec: { orderIds: string[]; lineIds: string[] } = { orderIds: [], lineIds: [] };
  if (fs.existsSync(UNDO)) {
    const prev = JSON.parse(fs.readFileSync(UNDO, "utf8")) as typeof rec;
    rec.orderIds.push(...prev.orderIds);
    rec.lineIds.push(...prev.lineIds);
  }

  for (const b of todo) {
    const order = await prisma.businessCardOrder.create({
      data: {
        orderedOn: b.orderedOn,
        orderedLabel: b.orderedLabel,
        receivedOn: b.receivedOn,
        receivedLabel: b.receivedLabel,
        source: "SHEET_IMPORT",
        note: "Imported from the orders workbook, DataStatus tab."
      }
    });
    rec.orderIds.push(order.id);
    for (const l of b.lines) {
      const hire = byName.get(l.matchKey) ?? null;
      const line = await prisma.businessCardOrderLine.create({
        data: { orderId: order.id, newHireId: hire?.id ?? null, personName: l.name }
      });
      rec.lineIds.push(line.id);
    }
    console.log("  " + (b.orderedLabel ?? "(undated)").padEnd(12) + " " + b.lines.length + " lines");
    fs.writeFileSync(UNDO, JSON.stringify(rec, null, 1));
  }

  console.log("\nWrote " + rec.orderIds.length + " orders and " + rec.lineIds.length + " lines.");
  console.log("Undo with: npx tsx scripts/card-order-import/import.ts --undo");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
