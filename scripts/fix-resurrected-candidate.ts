/**
 * Re-archive candidates that were MERGED AWAY and then resurrected by a job link.
 *
 * WHY. app/api/candidate-applications/route.ts un-archived ANY archived candidate
 * attached to a job. It excluded employed hires but not MERGED rows, so linking a
 * job to a tombstone flipped it back to ACTIVE. The merge had already moved the
 * files, metrics and history onto the keeper, so the resurrected row is a hollow
 * duplicate of a real person sitting in the live scan pool while the record that
 * holds the evidence stays archived.
 *
 * Found 2026-08-31 via feedback cmthjmp2y: candidate cmqjupt5b, merged into
 * cmqvr4z3r0fknxcrmnt8p5a4q on 2026-06-27, was ACTIVE with 0 files and 0 metrics
 * against the keeper's 3 and 21. Both are Matthew Smith on one email and one phone.
 *
 * WHAT IT CHANGES. Exactly what the route changed, and nothing else: status back to
 * MERGED and archivedAt back to the mergedAt recorded in mergeHistoryJson. It does
 * NOT touch stage, contacts, or any application. The route guard shipped alongside
 * this is what stops it happening again — running this without that guard fixes
 * nothing, because the next job link undoes it.
 *
 * APPLICATIONS ARE DELIBERATELY LEFT ALONE. The resurrection created an application
 * on the shell, but the keeper ALREADY has one to the same job (Pilatus PC-12
 * Captain, from 2026-06-19). Moving it would duplicate; deleting it would be
 * destructive. Archiving the shell takes it out of view with nothing destroyed.
 *
 * The undo path is built from process.cwd(), NOT __dirname: under tsx __dirname
 * resolves to prisma/generated/client, which .gitignore catches, and an undo record
 * that cannot be committed is not a safety net.
 *
 *   npx tsx scripts/fix-resurrected-candidate.ts            # dry run -> review file
 *   npx tsx scripts/fix-resurrected-candidate.ts --apply    # write + record undo
 *   npx tsx scripts/fix-resurrected-candidate.ts --undo     # revert from the record
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
const OUT_DIR = join(process.cwd(), "scripts", "resurrected-candidate-fix");
const UNDO_FILE = join(OUT_DIR, "UNDO.json");
const REVIEW_FILE = join(OUT_DIR, "review.txt");

type UndoRow = { id: string; status: string | null; archivedAt: string | null };

/**
 * mergeHistoryJson is a String column, not a Json one, so it arrives as raw text
 * and has to be parsed. The dry run caught this: an object-shaped check silently
 * skipped the one row that needed fixing and reported "nothing to do", which is
 * exactly the false-negative a dry run exists to surface.
 */
function mergedAtOf(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const v = (parsed as Record<string, unknown>).mergedAt;
  return typeof v === "string" && v.trim() ? v : null;
}

async function main() {
  console.log("undo path: " + UNDO_FILE);

  if (UNDO) {
    if (!existsSync(UNDO_FILE)) throw new Error("No undo record at " + UNDO_FILE);
    const rows: UndoRow[] = JSON.parse(readFileSync(UNDO_FILE, "utf8")).rows;
    for (const r of rows) {
      await prisma.candidate.update({
        where: { id: r.id },
        data: { status: r.status ?? "ACTIVE", archivedAt: r.archivedAt ? new Date(r.archivedAt) : null }
      });
      console.log("  reverted " + r.id + " -> status=" + r.status + " archivedAt=" + r.archivedAt);
    }
    console.log("undo complete: " + rows.length + " row(s)");
    return;
  }

  // WHOLE SCOPE, not a hardcoded id: every candidate carrying merge history that is
  // not archived. That is the definition of "resurrected".
  const all = await prisma.candidate.findMany({
    where: { mergeHistoryJson: { not: null } },
    select: {
      id: true, firstName: true, lastName: true, primaryEmail: true,
      status: true, archivedAt: true, mergeHistoryJson: true,
      _count: { select: { files: true, metrics: true, applications: true } }
    }
  });
  const resurrected = all.filter((c) => !c.archivedAt);

  const lines: string[] = [];
  lines.push("Resurrected merged-away candidates — " + new Date().toISOString());
  lines.push("candidates carrying merge history: " + all.length);
  lines.push("of those, archived (correct): " + (all.length - resurrected.length));
  lines.push("of those, LIVE (to re-archive): " + resurrected.length);
  lines.push("");

  const undoRows: UndoRow[] = [];
  for (const c of resurrected) {
    const mergedAt = mergedAtOf(c.mergeHistoryJson);
    if (!mergedAt) {
      lines.push("SKIP  " + c.id + "  no mergedAt in mergeHistoryJson — left alone");
      continue;
    }
    lines.push("RE-ARCHIVE  " + c.id);
    lines.push("   " + c.firstName + " " + c.lastName + "  " + String(c.primaryEmail));
    lines.push("   status " + String(c.status) + " -> MERGED");
    lines.push("   archivedAt null -> " + mergedAt);
    lines.push("   holds files=" + c._count.files + " metrics=" + c._count.metrics +
      " applications=" + c._count.applications + " (left untouched)");
    undoRows.push({ id: c.id, status: c.status, archivedAt: null });
  }
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

  for (const c of resurrected) {
    const mergedAt = mergedAtOf(c.mergeHistoryJson);
    if (!mergedAt) continue;
    await prisma.candidate.update({
      where: { id: c.id },
      data: { status: "MERGED", archivedAt: new Date(mergedAt) }
    });
    console.log("applied: " + c.id + " -> MERGED, archivedAt " + mergedAt);
  }

  // Read back rather than trusting the writes.
  const after = await prisma.candidate.findMany({
    where: { mergeHistoryJson: { not: null } },
    select: { id: true, status: true, archivedAt: true }
  });
  console.log("\nread back — carrying merge history: " + after.length +
    ", still live: " + after.filter((c) => !c.archivedAt).length + " (want 0)");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("ERROR:", e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
