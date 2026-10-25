import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { sanitizeFilename } from "@/lib/files/candidate-file-storage";
import { createS3UploadUrl, getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { SOURCE_TYPE } from "@/lib/paycom/applicant-import";
import { uploadKey, type BatchSummary } from "@/lib/paycom/applicant-batch";

// Paycom's two zips, a few PDFs at most. 100 MB covers a year's export with room.
const MAX_BYTES = 100 * 1024 * 1024;

/** Start a Paycom applicant upload: one batch, and a direct-to-S3 upload URL per file. */
export async function POST(request: Request) {
  const auth = await requireApiPermission("imports:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  if (getFileStorageAdapter().provider !== "s3") {
    return NextResponse.json({ message: "The Paycom upload needs private S3 storage, which isn't configured here." }, { status: 503 });
  }

  const payload = (await request.json()) as { files?: Array<{ name?: string; size?: number; type?: string }> };
  const files = (payload.files ?? []).map((f) => ({
    name: sanitizeFilename(f.name ?? ""),
    size: Number(f.size ?? 0),
    type: f.type || "application/octet-stream"
  }));
  if (!files.length) return NextResponse.json({ message: "Choose the Paycom zip files to upload." }, { status: 400 });
  if (files.length > 10) return NextResponse.json({ message: "Upload at most 10 files at a time." }, { status: 400 });
  const bad = files.find((f) => !f.name || !/\.(zip|pdf)$/i.test(f.name) || f.size <= 0 || f.size > MAX_BYTES);
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
    uploads: files.map((f) => ({ name: f.name, key: uploadKey(batch.id, f.name), size: f.size })),
    uploadedBy: auth.user.email ?? null
  };
  await prisma.importBatch.update({ where: { id: batch.id }, data: { summaryJson: JSON.stringify(summary) } });

  const uploads = await Promise.all(
    files.map(async (f, i) => ({
      name: f.name,
      contentType: f.type,
      uploadUrl: await createS3UploadUrl({
        storageKey: summary.uploads[i].key,
        contentType: f.type,
        metadata: { source: "paycom-applicant-upload", uploadedByEmail: auth.user.email ?? "unknown" }
      })
    }))
  );
  return NextResponse.json({ ok: true, batchId: batch.id, uploads });
}
