import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { createCandidateStorageKey, isSupportedCandidateFile, sanitizeFilename } from "@/lib/files/candidate-file-storage";
import { createS3UploadUrl, getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { isPrivateFileStorageReady, shouldRequirePrivateFileStorage } from "@/lib/files/file-security";

const maxDirectUploadSizeBytes = 100 * 1024 * 1024;

type PresignRequest = {
  files?: Array<{ name?: string; size?: number; type?: string }>;
};

export async function POST(request: Request) {
  const auth = await requireApiPermission("files:write");
  if (!auth.ok) {
  return NextResponse.json(
    { message: "Unauthorized" },
    { status: 401 }
  );
}

  const storage = getFileStorageAdapter();
  if (shouldRequirePrivateFileStorage() && !isPrivateFileStorageReady(storage)) {
    return NextResponse.json({ message: "File uploads require private S3 storage in this environment." }, { status: 503 });
  }
  if (storage.provider !== "s3") {
    return NextResponse.json({ message: "Direct resume uploads require private S3 storage." }, { status: 503 });
  }

  const payload = (await request.json()) as PresignRequest;
  const files = payload.files ?? [];
  if (!files.length) return NextResponse.json({ message: "Choose at least one file to upload." }, { status: 400 });
  if (files.length > 100) return NextResponse.json({ message: "Upload up to 100 files at a time." }, { status: 400 });

  const invalid = files.find((file) => {
    const filename = sanitizeFilename(file.name ?? "");
    return !filename || !isSupportedCandidateFile(filename) || Number(file.size ?? 0) <= 0 || Number(file.size ?? 0) > maxDirectUploadSizeBytes;
  });
  if (invalid) {
    return NextResponse.json(
      { message: `${sanitizeFilename(invalid.name ?? "A selected file")} is unsupported, empty, or larger than 100 MB.` },
      { status: 400 }
    );
  }

  const batch = await prisma.importBatch.create({
    data: { sourceType: "UNASSIGNED_FILE_UPLOAD", sourceFilename: `${files.length} file(s)`, status: "RUNNING", rowCount: files.length }
  });

  const uploads = await Promise.all(
    files.map(async (file, index) => {
      const originalFilename = sanitizeFilename(file.name ?? `candidate-file-${index + 1}`);
      const storageKey = createCandidateStorageKey("unassigned", originalFilename);
      const contentType = file.type || "application/octet-stream";
      const uploadUrl = await createS3UploadUrl({
        storageKey,
        contentType,
        metadata: { source: "imports-upload", uploadedByEmail: auth.user.email ?? "unknown" }
      });

      return {
        rowNumber: index + 1,
        originalFilename,
        displayFilename: originalFilename,
        storageKey,
        sizeBytes: file.size ?? null,
        mimeType: contentType,
        uploadUrl
      };
    })
  );

  return NextResponse.json({ ok: true, batchId: batch.id, uploads });
}
