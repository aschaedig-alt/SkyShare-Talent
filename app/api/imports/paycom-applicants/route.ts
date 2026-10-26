import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { sanitizeFilename } from "@/lib/files/candidate-file-storage";
import { getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { isPrivateFileStorageReady, shouldRequirePrivateFileStorage } from "@/lib/files/file-security";
import { SOURCE_TYPE } from "@/lib/paycom/applicant-import";
import { UPLOAD_PART_BYTES, uploadKey, type BatchSummary } from "@/lib/paycom/applicant-batch";

// Paycom's two zips, a few PDFs at most. 100 MB covers a year's export with room.
const MAX_BYTES = 100 * 1024 * 1024;

/**
 * Start a Paycom applicant upload: one batch, and how many parts each file is to be
 * sent in. The parts then go to ./[batchId]/upload — see lib/paycom/applicant-batch.ts
 * for why the files cannot travel in one request or straight to S3.
 */
export async function POST(request: Request) {
  const auth = await requireApiPermission("imports:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  if (shouldRequirePrivateFileStorage() && !isPrivateFileStorageReady(getFileStorageAdapter())) {
    return NextResponse.json({ message: "The Paycom upload needs private file storage, which isn't configured here." }, { status: 503 });
  }

  const payload = (await request.json()) as { files?: Array<{ name?: string; size?: number }> };
  const files = (payload.files ?? []).map((f) => ({ name: sanitizeFilename(f.name ?? ""), size: Number(f.size ?? 0) }));
  if (!files.length) return NextResponse.json({ message: "Choose the Paycom zip files to upload." }, { status: 400 });
  if (files.length > 10) return NextResponse.json({ message: "Upload at most 10 files at a time." }, { status: 400 });
  const bad = files.find((f) => !f.name || !/\.(zip|pdf)$/i.test(f.name) || !Number.isInteger(f.size) || f.size <= 0 || f.size > MAX_BYTES);
  if (bad) {
    return NextResponse.json({ message: `${bad.name || "A file"} is not a .zip or .pdf, is empty, or is over 100 MB.` }, { status: 400 });
  }
  if (new Set(files.map((f) => f.name)).size !== files.length) {
    return NextResponse.json({ message: "Two of the files have the same name." }, { status: 400 });
  }

  const batch = await prisma.importBatch.create({
    data: { sourceType: SOURCE_TYPE, sourceFilename: files.map((f) => f.name).join(", "), status: "UPLOADING" }
  });
  const summary: BatchSummary = {
    uploads: files.map((f) => ({ name: f.name, key: uploadKey(batch.id, f.name), size: f.size, parts: Math.ceil(f.size / UPLOAD_PART_BYTES) })),
    uploadedBy: auth.user.email ?? null
  };
  await prisma.importBatch.update({ where: { id: batch.id }, data: { summaryJson: JSON.stringify(summary) } });

  return NextResponse.json({
    ok: true,
    batchId: batch.id,
    partBytes: UPLOAD_PART_BYTES,
    files: summary.uploads.map((u, index) => ({ index, name: u.name, parts: u.parts }))
  });
}
