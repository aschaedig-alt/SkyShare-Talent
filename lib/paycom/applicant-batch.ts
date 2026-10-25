import { prisma } from "@/lib/prisma";
import { getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { readExport, SOURCE_TYPE, type Preview, type ReadExport } from "@/lib/paycom/applicant-import";
import type { ParsedApplication } from "@/lib/paycom/applicant-bundle";

/**
 * The ImportBatch behind one Paycom applicant upload, and the uploaded zips it points at.
 *
 * The zips go straight from the browser to S3 (they are over the ~4.5 MB request
 * body Vercel accepts — October's resume zip alone was 11.6 MB), under
 * paycom-imports/<batch id>/. The batch's summaryJson remembers their keys and, once
 * previewed, every parsed application with its page range — so applying a chunk
 * re-reads the bytes but never re-reads the text.
 *
 * Status: UPLOADING -> PREVIEWED -> APPLYING -> COMPLETED, or UNDONE.
 */

export type BatchUpload = { name: string; key: string; size: number };

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
    summary.uploads.map(async (u) => ({ name: u.name, bytes: new Uint8Array((await storage.read(u.key)).bytes) }))
  );
  if (opts.parsed && summary.applications) {
    const read = await readExport(files, { withText: false });
    return { ...read, applications: summary.applications };
  }
  return readExport(files);
}
