/**
 * Attach Jazz reference documents to their candidate profiles.
 *
 * The Jazz import created CandidateFile rows that only *reference* a file on
 * disk (metadataJson.originalPath) with no storageKey — so the app shows a name
 * but can't open the document. This reads each source file, uploads it via the
 * app's storage adapter, and sets storageKey/mimeType/sizeBytes so it's viewable.
 *
 * SAFETY:
 *  - Refuses to run unless the storage adapter resolves to S3 (so we never set a
 *    storageKey the live site can't read). Override for local testing with
 *    --allow-local.
 *  - Trial by default (--limit 20). Use --full for everything.
 *  - Reversible: --undo nulls storageKey on rows this script attached
 *    (marker metadata.attachedBy = "bulk-jazz-attach"). It does NOT delete the
 *    S3 objects (harmless orphans; delete separately if desired).
 *
 * Run:  npx tsx scripts/attach-jazz-files.ts --limit 20
 *       npx tsx scripts/attach-jazz-files.ts --full
 *       npx tsx scripts/attach-jazz-files.ts --undo
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/client/client";
import { getFileStorageAdapter } from "../lib/files/storage-adapter";
import {
  createCandidateStorageKey,
  isSupportedCandidateFile,
  sanitizeFilename
} from "../lib/files/candidate-file-storage";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const argv = process.argv.slice(2);
const FULL = argv.includes("--full");
const UNDO = argv.includes("--undo");
const ALLOW_LOCAL = argv.includes("--allow-local");
const limitIdx = argv.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(argv[limitIdx + 1] ?? "20", 10) : FULL ? Infinity : 20;
const CONCURRENCY = 6;
const ATTACH_MARKER = "bulk-jazz-attach";

// Fallback source roots, scanned by basename when metadata.originalPath is stale
// (files were moved out of the original Downloads location).
const FALLBACK_SOURCE_DIRS = [
  "C:\\Users\\Recruiter\\resume-archive\\skyshare_export_20250616\\resumes",
  "G:\\Shared drives\\Human Resources Admin\\Jazz Stuff\\skyshare_export_20250616\\skyshare_export_20250616\\96093\\resume",
  "G:\\Shared drives\\Human Resources Admin\\Jazz Stuff\\skyshare_export_20250616\\skyshare_export_20250616\\96093\\document"
];

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
  ".rtf": "application/rtf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".html": "text/html",
  ".htm": "text/html",
  ".csv": "text/csv",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};
const mimeFor = (name: string) => MIME[extname(name).toLowerCase()] ?? "application/octet-stream";

let sourceIndex: Map<string, string> | null = null;
function buildSourceIndex(): Map<string, string> {
  const idx = new Map<string, string>();
  for (const dir of FALLBACK_SOURCE_DIRS) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!idx.has(name)) {
        const p = join(dir, name);
        try { if (statSync(p).isFile()) idx.set(name, p); } catch { /* ignore */ }
      }
    }
  }
  return idx;
}

function resolveSource(originalPath: string | null): string | null {
  if (originalPath && existsSync(originalPath)) return originalPath;
  if (!originalPath) return null;
  sourceIndex ??= buildSourceIndex();
  return sourceIndex.get(basename(originalPath)) ?? null;
}

async function pool<T>(items: T[], n: number, fn: (t: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        await fn(items[i], i);
      }
    })
  );
}

async function undo() {
  const rows = await prisma.candidateFile.findMany({
    where: { source: "JAZZ", storageKey: { not: null }, metadataJson: { contains: ATTACH_MARKER } },
    select: { id: true }
  });
  console.log(`\nUNDO — nulling storageKey on ${rows.length} bulk-attached rows (S3 objects left as orphans).`);
  let n = 0;
  for (const r of rows) {
    await prisma.candidateFile.update({ where: { id: r.id }, data: { storageKey: null, sizeBytes: null } });
    if (++n % 200 === 0) console.log(`  ...${n}/${rows.length}`);
  }
  console.log(`Done. Reverted ${n}.`);
  await prisma.$disconnect();
}

async function run() {
  const storage = getFileStorageAdapter();
  console.log(`Storage provider: ${storage.provider}`);
  if (storage.provider !== "s3" && !ALLOW_LOCAL) {
    console.error(
      "\nREFUSING TO RUN: storage is not S3.\n" +
        "The live site serves files from S3, so attaching to local disk would set a storageKey the\n" +
        "live site can't read. Add FILE_STORAGE_PROVIDER=s3 + S3_CANDIDATE_FILES_BUCKET + AWS_REGION +\n" +
        "AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY to .env.local, or pass --allow-local for a local-only test.\n"
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  const candidates = await prisma.candidateFile.findMany({
    where: { source: "JAZZ", storageKey: null },
    select: { id: true, candidateId: true, originalFilename: true, displayFilename: true, metadataJson: true }
  });
  const targets = isFinite(LIMIT) ? candidates.slice(0, LIMIT) : candidates;
  console.log(`Jazz reference files without storageKey: ${candidates.length}. Attaching: ${targets.length}.\n`);

  let attached = 0, missing = 0, unsupported = 0, skippedNoCandidate = 0, errors = 0, done = 0;

  await pool(targets, CONCURRENCY, async (row) => {
    done++;
    try {
      if (!row.candidateId) { skippedNoCandidate++; return; }
      let meta: Record<string, unknown> = {};
      try { meta = JSON.parse(row.metadataJson ?? "{}"); } catch { /* ignore */ }
      const src = resolveSource((meta.originalPath as string) ?? null);
      if (!src) { missing++; return; }

      const displayName = sanitizeFilename(row.displayFilename || row.originalFilename || basename(src));
      if (!isSupportedCandidateFile(displayName)) { unsupported++; return; }

      const bytes = readFileSync(src);
      const storageKey = createCandidateStorageKey(row.candidateId, displayName);
      const contentType = mimeFor(displayName);
      await storage.write({
        storageKey,
        bytes,
        contentType,
        metadata: { candidateId: row.candidateId, source: "jazz-archive", attachedBy: ATTACH_MARKER }
      });

      await prisma.candidateFile.update({
        where: { id: row.id },
        data: {
          storageKey,
          mimeType: contentType,
          sizeBytes: bytes.length,
          metadataJson: JSON.stringify({ ...meta, attachedBy: ATTACH_MARKER, attachedAt: new Date().toISOString(), storageProvider: storage.provider })
        }
      });
      attached++;
    } catch (e) {
      errors++;
      console.warn(`  error on ${row.originalFilename}: ${(e as Error).message.slice(0, 70)}`);
    }
    if (done % 100 === 0) console.log(`  ...${done}/${targets.length} (attached ${attached})`);
  });

  console.log(`\n--- DONE ---`);
  console.log(`Attached ............. ${attached}`);
  console.log(`Source missing ....... ${missing}`);
  console.log(`Unsupported type ..... ${unsupported}`);
  console.log(`No candidate link .... ${skippedNoCandidate}`);
  console.log(`Errors ............... ${errors}`);
  console.log(`\nUndo: npx tsx scripts/attach-jazz-files.ts --undo\n`);
  await prisma.$disconnect();
}

(UNDO ? undo() : run()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
