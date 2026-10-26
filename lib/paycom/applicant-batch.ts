import { prisma } from "@/lib/prisma";
import { getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { readExport, SOURCE_TYPE, type Preview, type ReadExport } from "@/lib/paycom/applicant-import";
import type { ParsedApplication } from "@/lib/paycom/applicant-bundle";

/**
 * The ImportBatch behind one Paycom applicant upload, and the uploaded zips it points at.
 *
 * HOW THE ZIPS ARRIVE. Through the app, in parts of at most UPLOAD_PART_BYTES, each
 * stored as its own object under paycom-imports/<batch id>/ and joined back together
 * when read. Two limits force that shape:
 *   - Vercel refuses a request body over ~4.5 MB, and October's resume zip alone was
 *     11.6 MB, so a file cannot come in one request.
 *   - The browser cannot send it straight to S3 instead: the bucket has NO CORS rule,
 *     so S3 refuses the browser's preflight ("CORS is not enabled for this bucket",
 *     checked 2026-10-25 from the live site and from localhost). That is what the first
 *     version did, and the live page answered "Failed to fetch".
 *
 * The batch's summaryJson remembers the uploads and, once previewed, every parsed
 * application with its page range — so applying a chunk re-reads the bytes but never
 * re-reads the text.
 *
 * Status: UPLOADING -> PREVIEWED -> APPLYING -> COMPLETED, or UNDONE.
 */

/** Under Vercel's ~4.5 MB request body ceiling with room to spare. */
export const UPLOAD_PART_BYTES = 3 * 1024 * 1024;

export type BatchUpload = { name: string; key: string; size: number; parts: number };

export function partKey(upload: BatchUpload, part: number) {
  return `${upload.key}.part-${String(part).padStart(4, "0")}`;
}

export type BatchSummary = {
  uploads: BatchUpload[];
  applications?: ParsedApplication[];
  preview?: Preview;
  uploadedBy?: string | null;
  undo?: { at: string; by: string | null; undone: number; keptBecauseWorked: string[]; notes: string[] };
};

export function uploadKey(batchId: string, filename: string) {
  return `paycom-imports/${batchId}/${filename}`;
}

export async function loadBatch(batchId: string) {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch || batch.sourceType !== SOURCE_TYPE) return null;
  const summary = JSON.parse(batch.summaryJson ?? "{}") as BatchSummary;
  return { batch, summary };
}

export async function saveSummary(batchId: string, summary: BatchSummary, data: Record<string, unknown> = {}) {
  await prisma.importBatch.update({ where: { id: batchId }, data: { summaryJson: JSON.stringify(summary), ...data } });
}

/** The uploaded zips, unpacked. With `parsed`, the applications come from the preview instead of a fresh read. */
export async function readBatchUploads(summary: BatchSummary, opts: { parsed?: boolean } = {}): Promise<ReadExport> {
  const storage = getFileStorageAdapter();
  const files = await Promise.all(
    summary.uploads.map(async (u) => {
      const parts = await Promise.all(Array.from({ length: u.parts }, async (_, i) => (await storage.read(partKey(u, i))).bytes));
      const bytes = new Uint8Array(Buffer.concat(parts));
      // A part that never arrived reads as an error above; one that arrived short
      // would hand the zip reader a truncated file, so check the total too.
      if (bytes.byteLength !== u.size) throw new Error(`${u.name} arrived as ${bytes.byteLength} bytes, expected ${u.size}. Upload it again.`);
      return { name: u.name, bytes };
    })
  );
  if (opts.parsed && summary.applications) {
    const read = await readExport(files, { withText: false });
    return { ...read, applications: summary.applications };
  }
  return readExport(files);
}
