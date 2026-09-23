/**
 * Fill CandidateFile.searchText and appliedForText for the signed Pilot
 * Applications already on file - what candidate search reads for them instead of
 * their run-together flattened text (see pilotApplicationSearchFields in
 * lib/files/pdf-form.ts). New files get both when they arrive; this is for the
 * ones that arrived before 2026-09-23.
 *
 *   npx tsx scripts/backfill-pilot-app-search-text.ts                 DRY RUN: reads PDFs, writes nothing
 *   npx tsx scripts/backfill-pilot-app-search-text.ts --apply --limit 5
 *   npx tsx scripts/backfill-pilot-app-search-text.ts --apply
 *   npx tsx scripts/backfill-pilot-app-search-text.ts --undo <undo.json>
 *   npx tsx scripts/backfill-pilot-app-search-text.ts --refresh-answers [--apply]   strip form labels from text already written
 *   npx tsx scripts/backfill-pilot-app-search-text.ts --undo-refresh <refresh-undo.json>
 *
 * Targets every file whose text carries the V4 form's certificate block - 1,300
 * on 2026-09-23, of which only 498 are typed "Pilot Application" (801 arrived as
 * "Other"). The layout reader confirms each one before anything is written, and
 * it only ever fills EMPTY columns, so a re-run changes nothing it already did.
 * The undo file lists the rows written; undoing sets both columns back to null,
 * which is what they were.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../lib/prisma";
import { getFileStorageAdapter } from "../lib/files/storage-adapter";
import { pilotApplicationSearchFields } from "../lib/files/pdf-form";
import { answersOnly } from "../lib/files/pilot-application-labels";

const argv = process.argv.slice(2);
const has = (flag: string) => argv.includes(flag);
const val = (flag: string) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};
const APPLY = has("--apply");
const LIMIT = Number(val("--limit") ?? "0") || 0;
const OUT = val("--out") ?? ".claude/handoffs/pilot-app-search-text";
const CONCURRENCY = 4;

/**
 * --refresh-answers: bring text already written up to date with answersOnly
 * (lib/files/pilot-application-labels.ts) - no PDF is re-read, the stored layout
 * text is stripped of the form's printed labels. Keeps every old text in its
 * undo file; --undo-refresh puts them back.
 */
async function refreshAnswers() {
  const rows = await prisma.candidateFile.findMany({ where: { searchText: { not: null } }, select: { id: true, searchText: true } });
  const changed = rows.map((row) => ({ id: row.id, before: row.searchText!, after: answersOnly(row.searchText!) })).filter((row) => row.after !== row.before);
  console.log(`${APPLY ? "APPLY" : "DRY RUN"}: ${rows.length} file(s) carry search text, ${changed.length} would lose their form labels`);
  if (changed[0]) {
    console.log(`  e.g. ${changed[0].id}: ${changed[0].before.length} -> ${changed[0].after.length} chars`);
    console.log(`  after: ${changed[0].after.slice(0, 240).replace(/\n/g, " / ")}`);
  }
  if (!APPLY) return;
  mkdirSync(OUT, { recursive: true });
  const undoPath = path.join(OUT, `refresh-undo-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(undoPath, JSON.stringify(changed.map(({ id, before }) => ({ id, before }))));
  let written = 0;
  for (const row of changed) {
    const result = await prisma.candidateFile.updateMany({ where: { id: row.id, searchText: row.before }, data: { searchText: row.after } });
    written += result.count;
  }
  console.log(`written: ${written} | undo: ${undoPath}`);
}

async function undoRefresh(file: string) {
  const rows = JSON.parse(readFileSync(file, "utf8")) as Array<{ id: string; before: string }>;
  let restored = 0;
  for (const row of rows) restored += (await prisma.candidateFile.updateMany({ where: { id: row.id }, data: { searchText: row.before } })).count;
  console.log(`restored: ${restored} of ${rows.length}`);
}

async function undo(file: string) {
  const ids = JSON.parse(readFileSync(file, "utf8")) as string[];
  const result = await prisma.candidateFile.updateMany({ where: { id: { in: ids } }, data: { searchText: null, appliedForText: null } });
  console.log(`undone: ${result.count} of ${ids.length} file(s) back to no search text`);
}

async function main() {
  const undoFile = val("--undo");
  if (undoFile) return undo(undoFile);
  const undoRefreshFile = val("--undo-refresh");
  if (undoRefreshFile) return undoRefresh(undoRefreshFile);
  if (has("--refresh-answers")) return refreshAnswers();

  const targets = await prisma.candidateFile.findMany({
    where: {
      storageKey: { not: null },
      searchText: null,
      appliedForText: null,
      extractedText: { contains: "INDICATE ALL CERTIFICATES", mode: "insensitive" }
    },
    select: { id: true, storageKey: true, displayFilename: true, documentType: true, candidateId: true },
    orderBy: { uploadedAt: "asc" },
    ...(LIMIT ? { take: LIMIT } : {})
  });
  console.log(`${APPLY ? "APPLY" : "DRY RUN"}: ${targets.length} file(s) carry the Pilot Application form and have no search text yet`);

  const storage = getFileStorageAdapter();
  const written: string[] = [];
  const lines: string[] = [];
  const tally = { form: 0, withPosition: 0, notV4: 0, failed: 0 };
  let next = 0;

  async function worker() {
    while (next < targets.length) {
      const file = targets[next++];
      try {
        const { bytes } = await storage.read(file.storageKey!);
        const fields = await pilotApplicationSearchFields(new Uint8Array(bytes));
        if (!fields) {
          tally.notV4 += 1;
          lines.push(`not read as a V4 form: ${file.id} ${file.displayFilename}`);
          continue;
        }
        tally.form += 1;
        if (fields.appliedForText) tally.withPosition += 1;
        lines.push(`${file.id} [${file.documentType ?? "-"}] position: ${JSON.stringify(fields.appliedForText)} | ${fields.searchText.length} chars`);
        if (APPLY) {
          const result = await prisma.candidateFile.updateMany({
            // Only if still empty - never overwrite.
            where: { id: file.id, searchText: null, appliedForText: null },
            data: { searchText: fields.searchText, appliedForText: fields.appliedForText }
          });
          if (result.count === 1) written.push(file.id);
        }
      } catch (error) {
        tally.failed += 1;
        lines.push(`FAILED ${file.id} ${file.displayFilename}: ${error instanceof Error ? error.message : String(error)}`);
      }
      if ((tally.form + tally.notV4 + tally.failed) % 100 === 0) console.log(`  ${tally.form + tally.notV4 + tally.failed}/${targets.length}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));

  mkdirSync(OUT, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const review = path.join(OUT, `${APPLY ? "applied" : "dry-run"}-${stamp}.txt`);
  writeFileSync(review, [`${JSON.stringify(tally)}`, "", ...lines.sort()].join("\n") + "\n");
  console.log(JSON.stringify(tally));
  console.log(`review: ${review}`);
  if (APPLY) {
    const undoPath = path.join(OUT, `undo-${stamp}.json`);
    writeFileSync(undoPath, JSON.stringify(written));
    console.log(`written: ${written.length} | undo: ${undoPath}`);
  }
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("FAILED:", error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
