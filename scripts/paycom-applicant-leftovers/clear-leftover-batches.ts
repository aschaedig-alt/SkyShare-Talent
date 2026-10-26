// Clear the three Paycom applicant ImportBatch rows left by the upload's first live
// attempts (two stuck at UPLOADING, before the CORS fix) and the working session's local
// end-to-end test (one PREVIEWED, never applied). Asked for by him, 2026-10-25.
//
//   npx tsx scripts/paycom-applicant-leftovers/clear-leftover-batches.ts            dry run
//   npx tsx scripts/paycom-applicant-leftovers/clear-leftover-batches.ts --apply    delete, writing an undo record first
//   npx tsx scripts/paycom-applicant-leftovers/clear-leftover-batches.ts --undo     put them back from the undo record
//
// RAN 2026-10-25 21:24 MT: deleted 3. The undo record is on the laptop that ran it, in
// scripts/_paycom-applicant-leftovers_output/ (not in git - see UNDO_FILE).
//
// Refuses unless every batch is still in the state it was found in, holds 0 ImportRows,
// and nothing (HistoricalSource) points at it. The uploaded zip parts in S3 under
// paycom-imports/<batch>/ are NOT deleted - an S3 delete cannot be undone - so the undo
// record lists them; they are orphaned but harmless.
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";

const EXPECTED: Record<string, string> = {
  cmvok9w3f000008l0y2i6g4vi: "UPLOADING",
  cmvokah4t000108l0nstji7a8: "UPLOADING",
  cmvokglsk0000c0rmh5sfubsv: "PREVIEWED"
};
const KEEP = "cmvokyco3000008kxveowrsly"; // his real October import - never touched
// Gitignored on purpose: the batches' preview summaries carry ~95 applicants' emails and
// phone numbers, which should not go into git history for three throwaway rows.
const UNDO_FILE = path.join(process.cwd(), "scripts/_paycom-applicant-leftovers_output/undo-clear-leftover-batches.json");

async function main() {
  if (process.argv.includes("--undo")) {
    const rec = JSON.parse(fs.readFileSync(UNDO_FILE, "utf8")) as { batches: Array<Record<string, unknown>> };
    for (const b of rec.batches) {
      await prisma.importBatch.create({ data: { ...b, createdAt: new Date(b.createdAt as string), completedAt: b.completedAt ? new Date(b.completedAt as string) : null } as never });
      console.log(`restored ${b.id}`);
    }
    return;
  }

  const ids = Object.keys(EXPECTED);
  if (ids.includes(KEEP)) throw new Error("the real import is on the list");
  const batches = await prisma.importBatch.findMany({ where: { id: { in: ids } } });
  const rows = await prisma.importRow.count({ where: { importBatchId: { in: ids } } });
  const sources = await prisma.historicalSource.count({ where: { importBatchId: { in: ids } } });
  const all = await prisma.importBatch.findMany({ where: { sourceType: "PAYCOM_APPLICANTS" }, select: { id: true, status: true, _count: { select: { rows: true } } }, orderBy: { createdAt: "asc" } });

  console.log("ALL PAYCOM_APPLICANTS batches (positive control - the kept import must show):");
  for (const b of all) console.log(`  ${b.id}  ${b.status}  rows ${b._count.rows}  ${b.id in EXPECTED ? "-> DELETE" : "keep"}`);
  const problems: string[] = [];
  if (batches.length !== ids.length) problems.push(`found ${batches.length} of ${ids.length}`);
  for (const b of batches) if (b.status !== EXPECTED[b.id] || b.sourceType !== "PAYCOM_APPLICANTS") problems.push(`${b.id} is ${b.sourceType}/${b.status}`);
  if (rows) problems.push(`${rows} ImportRows hang off them`);
  if (sources) problems.push(`${sources} HistoricalSource rows point at them`);
  const keys = batches.flatMap((b) => {
    try { return ((JSON.parse(b.summaryJson ?? "{}").uploads ?? []) as Array<{ key: string; parts?: number }>).map((u) => `${u.key} (${u.parts ?? "?"} parts)`); } catch { return []; }
  });
  console.log(`\nto delete: ${batches.length} batches, ImportRows ${rows}, HistoricalSource refs ${sources}`);
  console.log(`S3 upload keys left in place:\n  ${keys.join("\n  ") || "(none recorded)"}`);
  if (problems.length) throw new Error(`REFUSING: ${problems.join("; ")}`);

  if (!process.argv.includes("--apply")) { console.log("\nDRY RUN - nothing written. Undo file would be:", UNDO_FILE); return; }
  fs.writeFileSync(UNDO_FILE, JSON.stringify({ clearedAt: new Date().toISOString(), batches, s3KeysLeftInPlace: keys }, null, 1));
  const res = await prisma.importBatch.deleteMany({ where: { id: { in: ids }, status: { in: ["UPLOADING", "PREVIEWED"] } } });
  console.log(`\nDELETED ${res.count}. Undo: npx tsx scripts/paycom-applicant-leftovers/clear-leftover-batches.ts --undo`);
}
main().finally(() => prisma.$disconnect());
