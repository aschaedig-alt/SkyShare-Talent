/**
 * Bring back the people whose CURRENT application was merged into an ARCHIVED record.
 *
 * WHY. A merge keeps one row and leaves the other as a tombstone. Eight of them
 * pointed the wrong way: a live Paycom applicant was folded INTO that person's old
 * archived Jazz record, so the surviving row stayed ARCHIVED. The person had
 * applied, but they were out of the live list and out of the scan pool, reachable
 * only by searching the archive.
 *
 * His words on 2026-08-31: "for an archived candidate who becomes active now,
 * their info should still be in one place", and "I just want one line for each
 * candidate".
 *
 * WHAT IT CHANGES. archivedAt to null and status to ACTIVE, on the KEEPER only.
 * Nothing is merged, un-merged, created or deleted, and the tombstones are left
 * exactly as they are — they already carry the history and are already hidden
 * from the list.
 *
 * HOW THE SET IS CHOSEN, rather than by a hardcoded list of ids: every MERGED row
 * whose own origin is NOT Jazz (so a real current applicant) and whose keeper is
 * ARCHIVED. That is the definition of "buried", so a recurrence is covered too.
 *
 * A keeper that is ITSELF merged is skipped and reported. Two of those exist — a
 * chain, where one hop of mergedIntoCandidateId lands on another tombstone — and
 * guessing which end of a chain should be live is not this script's call.
 *
 * The undo path is built from process.cwd(), NOT __dirname: under tsx __dirname
 * resolves to prisma/generated/client, which .gitignore catches.
 *
 *   npx tsx scripts/activate-buried-keepers.ts            # dry run -> review file
 *   npx tsx scripts/activate-buried-keepers.ts --apply    # write + record undo
 *   npx tsx scripts/activate-buried-keepers.ts --undo     # revert from the record
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
const OUT_DIR = join(process.cwd(), "scripts", "buried-keepers-fix");
const UNDO_FILE = join(OUT_DIR, "UNDO.json");
const REVIEW_FILE = join(OUT_DIR, "review.txt");

type UndoRow = { id: string; status: string; archivedAt: string | null };

function keeperIdOf(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as { mergedIntoCandidateId?: unknown };
    return typeof parsed.mergedIntoCandidateId === "string" ? parsed.mergedIntoCandidateId : null;
  } catch {
    return null;
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
        data: { status: r.status, archivedAt: r.archivedAt ? new Date(r.archivedAt) : null }
      });
      console.log("  reverted " + r.id + " -> " + r.status + " / archivedAt " + r.archivedAt);
    }
    console.log("undo complete: " + rows.length + " row(s)");
    return;
  }

  const tombstones = await prisma.candidate.findMany({
    where: { status: "MERGED" },
    select: { id: true, displayName: true, origin: true, mergeHistoryJson: true }
  });

  const lines: string[] = [];
  lines.push("Buried keepers — " + new Date().toISOString());
  lines.push("tombstones (MERGED rows) examined: " + tombstones.length);
  lines.push("");

  const toActivate = new Map<string, UndoRow & { name: string; via: string }>();
  const skippedChain: string[] = [];
  const skippedFine: number[] = [0];

  for (const t of tombstones) {
    const keeperId = keeperIdOf(t.mergeHistoryJson);
    if (!keeperId) continue;
    // Only a CURRENT applicant folded away counts. A Jazz-into-Jazz merge is
    // archive housekeeping and should stay archived.
    if (t.origin === "JAZZ") { skippedFine[0]++; continue; }

    const keeper = await prisma.candidate.findUnique({
      where: { id: keeperId },
      select: { id: true, displayName: true, status: true, archivedAt: true, origin: true,
                _count: { select: { files: true, metrics: true, applications: true } } }
    });
    if (!keeper) { lines.push("SKIP  keeper " + keeperId + " not found (from " + t.displayName + ")"); continue; }
    if (keeper.status === "MERGED") {
      skippedChain.push(t.displayName + " -> keeper " + keeper.id + " is ITSELF merged");
      continue;
    }
    if (!keeper.archivedAt) { skippedFine[0]++; continue; }

    toActivate.set(keeper.id, {
      id: keeper.id,
      status: keeper.status,
      archivedAt: keeper.archivedAt.toISOString(),
      name: keeper.displayName,
      via: t.displayName + " (" + t.origin + ")"
    });
    lines.push("ACTIVATE  " + keeper.id);
    lines.push("   " + keeper.displayName + "   origin=" + String(keeper.origin));
    lines.push("   status " + keeper.status + " -> ACTIVE, archivedAt " +
      keeper.archivedAt.toISOString().slice(0, 10) + " -> null");
    lines.push("   carries files=" + keeper._count.files + " metrics=" + keeper._count.metrics +
      " applications=" + keeper._count.applications);
    lines.push("   buried by the merge of: " + t.displayName + " (" + t.origin + ")");
    lines.push("");
  }

  lines.push("TO ACTIVATE: " + toActivate.size);
  lines.push("LEFT ALONE, correctly archived: " + skippedFine[0]);
  lines.push("SKIPPED, keeper is itself merged (a chain — needs a human): " + skippedChain.length);
  for (const s of skippedChain) lines.push("   " + s);

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(REVIEW_FILE, lines.join("\n") + "\n", "utf8");
  console.log(lines.join("\n"));
  console.log("\nreview written to " + REVIEW_FILE);

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to write.");
    return;
  }

  const undoRows: UndoRow[] = [...toActivate.values()].map((r) => ({
    id: r.id, status: r.status, archivedAt: r.archivedAt
  }));
  writeFileSync(UNDO_FILE, JSON.stringify({ writtenAt: new Date().toISOString(), rows: undoRows }, null, 2), "utf8");
  console.log("undo record written BEFORE any change: " + UNDO_FILE);

  for (const r of toActivate.values()) {
    await prisma.candidate.update({
      where: { id: r.id },
      data: { status: "ACTIVE", archivedAt: null }
    });
    console.log("applied: " + r.name + " (" + r.id + ") -> ACTIVE");
  }

  const after = await prisma.candidate.findMany({
    where: { id: { in: [...toActivate.keys()] } },
    select: { id: true, displayName: true, status: true, archivedAt: true }
  });
  console.log("\nread back:");
  for (const a of after)
    console.log("  " + a.displayName.padEnd(24) + a.status + "  archivedAt=" + (a.archivedAt ? "STILL SET" : "null"));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("ERROR:", e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
