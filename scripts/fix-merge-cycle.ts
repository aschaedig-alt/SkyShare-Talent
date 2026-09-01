/**
 * Break circular merges, where two rows are each marked merged into the other.
 *
 * WHY. mergeCandidates refuses to merge a record that is ALREADY merged (the drop
 * side) but never checked the KEEP side, so merging into a tombstone was allowed.
 * Do that twice in opposite directions and both rows end up MERGED with neither
 * surviving — the person has no live record at all.
 *
 * It happened to Chari Kroeplin. Her Paycom row was merged into her Jazz row on
 * 2026-06-27, pointing the wrong way like eight others. On 2026-07-16 that was
 * corrected by merging the Jazz row back into the Paycom row, which moved the data
 * to the right place but left BOTH rows flagged MERGED. She was invisible the
 * moment merged rows stopped being listed.
 *
 * WHAT IT CHANGES. On the row that should survive: status to ACTIVE, archivedAt to
 * null, and mergeHistoryJson cleared — it is no longer merged into anything, and
 * leaving that field set would keep asserting it is a tombstone, which is what the
 * candidate-applications guard reads. Nothing else moves. The OTHER row stays a
 * MERGED tombstone pointing at the survivor, so the merge is still recorded, just
 * on the correct side.
 *
 * WHICH ROW SURVIVES is not a guess: within a cycle, the row holding the data wins
 * (files + metrics + applications + interviews). That is the row the later merge
 * moved everything onto. A tie falls back to the most recent mergedAt, which is the
 * correction somebody made last.
 *
 *   npx tsx scripts/fix-merge-cycle.ts            # dry run -> review file
 *   npx tsx scripts/fix-merge-cycle.ts --apply    # write + record undo
 *   npx tsx scripts/fix-merge-cycle.ts --undo     # revert from the record
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/client/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const APPLY = process.argv.includes("--apply");
const UNDO = process.argv.includes("--undo");
const OUT_DIR = join(process.cwd(), "scripts", "merge-cycle-fix");
const UNDO_FILE = join(OUT_DIR, "UNDO.json");
const REVIEW_FILE = join(OUT_DIR, "review.txt");

type UndoRow = { id: string; status: string; archivedAt: string | null; mergeHistoryJson: string | null };

function parseMerge(raw: unknown): { keeperId: string | null; mergedAt: string | null } {
  if (typeof raw !== "string") return { keeperId: null, mergedAt: null };
  try {
    const p = JSON.parse(raw) as { mergedIntoCandidateId?: unknown; mergedAt?: unknown };
    return {
      keeperId: typeof p.mergedIntoCandidateId === "string" ? p.mergedIntoCandidateId : null,
      mergedAt: typeof p.mergedAt === "string" ? p.mergedAt : null
    };
  } catch {
    return { keeperId: null, mergedAt: null };
  }
}

async function main() {
  console.log("undo path: " + UNDO_FILE);

  if (UNDO) {
    if (!existsSync(UNDO_FILE)) throw new Error("No undo record at " + UNDO_FILE);
    const rows: UndoRow[] = JSON.parse(readFileSync(UNDO_FILE, "utf8")).rows;
    for (const r of rows) {
      await prisma.candidate.update({
        where: { id: r.id },
        data: {
          status: r.status,
          archivedAt: r.archivedAt ? new Date(r.archivedAt) : null,
          mergeHistoryJson: r.mergeHistoryJson
        }
      });
      console.log("  reverted " + r.id + " -> " + r.status);
    }
    console.log("undo complete: " + rows.length + " row(s)");
    return;
  }

  const merged = await prisma.candidate.findMany({
    where: { status: "MERGED" },
    select: {
      id: true, displayName: true, status: true, archivedAt: true, mergeHistoryJson: true,
      _count: { select: { files: true, metrics: true, applications: true, interviews: true } }
    }
  });
  const byId = new Map(merged.map((m) => [m.id, m]));

  const lines: string[] = [];
  lines.push("Circular merges — " + new Date().toISOString());
  lines.push("MERGED rows examined: " + merged.length);
  lines.push("");

  const undoRows: UndoRow[] = [];
  const handled = new Set<string>();

  for (const row of merged) {
    if (handled.has(row.id)) continue;
    const { keeperId } = parseMerge(row.mergeHistoryJson);
    if (!keeperId) continue;
    const other = byId.get(keeperId);
    if (!other) continue; // keeper is not merged — a normal, healthy tombstone
    const back = parseMerge(other.mergeHistoryJson);
    if (back.keeperId !== row.id) continue; // not a two-row cycle

    handled.add(row.id);
    handled.add(other.id);

    const weight = (c: typeof row) =>
      c._count.files + c._count.metrics + c._count.applications + c._count.interviews;
    let survivor = row;
    let tombstone = other;
    if (weight(other) > weight(row)) {
      survivor = other;
      tombstone = row;
    } else if (weight(other) === weight(row)) {
      const a = parseMerge(row.mergeHistoryJson).mergedAt ?? "";
      const b = back.mergedAt ?? "";
      if (b > a) { survivor = other; tombstone = row; }
    }

    lines.push("CYCLE  " + row.displayName + "  <->  " + other.displayName);
    lines.push("   " + row.id + "  holds " + weight(row) + " records");
    lines.push("   " + other.id + "  holds " + weight(other) + " records");
    lines.push("   SURVIVOR  " + survivor.id + "  (" + survivor.displayName + ")");
    lines.push("      status " + survivor.status + " -> ACTIVE, archivedAt -> null, mergeHistoryJson -> cleared");
    lines.push("   TOMBSTONE " + tombstone.id + "  (" + tombstone.displayName + ")  left as-is");
    lines.push("");

    undoRows.push({
      id: survivor.id,
      status: survivor.status,
      archivedAt: survivor.archivedAt ? survivor.archivedAt.toISOString() : null,
      mergeHistoryJson: survivor.mergeHistoryJson
    });
  }

  lines.push("cycles found: " + undoRows.length);
  if (!undoRows.length) lines.push("Nothing to do.");

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(REVIEW_FILE, lines.join("\n") + "\n", "utf8");
  console.log(lines.join("\n"));
  console.log("\nreview written to " + REVIEW_FILE);

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to write.");
    return;
  }

  writeFileSync(UNDO_FILE, JSON.stringify({ writtenAt: new Date().toISOString(), rows: undoRows }, null, 2), "utf8");
  console.log("undo record written BEFORE any change: " + UNDO_FILE);

  for (const r of undoRows) {
    await prisma.candidate.update({
      where: { id: r.id },
      data: { status: "ACTIVE", archivedAt: null, mergeHistoryJson: null }
    });
    console.log("applied: " + r.id + " -> ACTIVE, merge history cleared");
  }

  const after = await prisma.candidate.findMany({
    where: { id: { in: undoRows.map((r) => r.id) } },
    select: { id: true, displayName: true, status: true, archivedAt: true, mergeHistoryJson: true }
  });
  console.log("\nread back:");
  for (const a of after)
    console.log("  " + a.displayName.padEnd(20) + a.status +
      "  archivedAt=" + (a.archivedAt ? "STILL SET" : "null") +
      "  mergeHistory=" + (a.mergeHistoryJson ? "STILL SET" : "cleared"));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("ERROR:", e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
