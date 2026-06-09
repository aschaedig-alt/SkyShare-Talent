import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createCandidateStorageKey, isSupportedCandidateFile, sanitizeFilename } from "@/lib/files/candidate-file-storage";
import { getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { isPrivateFileStorageReady, shouldRequirePrivateFileStorage } from "@/lib/files/file-security";
import { requireApiPermission } from "@/lib/auth/route-auth";

const maxFileSizeBytes = 25 * 1024 * 1024;

function isFileLike(value: FormDataEntryValue): value is File {
  return typeof value === "object" && "arrayBuffer" in value && "name" in value;
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("files:write");
  if (!auth.ok) return auth.response;

  const formData = await request.formData();
  const files = formData.getAll("files").filter(isFileLike);
  if (!files.length) {
    return NextResponse.json({ message: "Choose at least one file to upload." }, { status: 400 });
  }

  const storage = getFileStorageAdapter();
  if (shouldRequirePrivateFileStorage() && !isPrivateFileStorageReady(storage)) {
    return NextResponse.json({ message: "File uploads require private S3 storage in this environment." }, { status: 503 });
  }

  const batch = await prisma.importBatch.create({
    data: { sourceType: "UNASSIGNED_FILE_UPLOAD", sourceFilename: `${files.length} file(s)`, status: "RUNNING", rowCount: files.length }
  });

  let created = 0;
  let skipped = 0;
  let warnings = 0;

  try {
    for (const [index, file] of files.entries()) {
      const originalFilename = sanitizeFilename(file.name);
      if (!isSupportedCandidateFile(originalFilename) || file.size > maxFileSizeBytes) {
        skipped += 1;
        warnings += 1;
        await prisma.importRow.create({
          data: {
            importBatchId: batch.id,
            rowNumber: index + 1,
            rawJson: JSON.stringify({ filename: originalFilename, size: file.size, type: file.type }),
            status: "SKIPPED",
            warningJson: JSON.stringify(["Unsupported file type or file exceeds 25 MB."])
          }
        });
        continue;
      }

      const storageKey = createCandidateStorageKey("unassigned", originalFilename);
      await storage.write({
        storageKey,
        bytes: Buffer.from(await file.arrayBuffer()),
        contentType: file.type || null,
        metadata: { source: "imports-upload", uploadedByEmail: auth.user.email ?? "unknown" }
      });

      const candidateFile = await prisma.candidateFile.create({
        data: {
          candidateId: null,
          originalFilename,
          displayFilename: originalFilename,
          storageKey,
          mimeType: file.type || null,
          sizeBytes: file.size,
          source: "imports-upload",
          metadataJson: JSON.stringify({ assignmentStatus: "unassigned", storageProvider: storage.provider })
        }
      });

      await prisma.importRow.create({
        data: {
          importBatchId: batch.id,
          rowNumber: index + 1,
          rawJson: JSON.stringify({ filename: originalFilename, size: file.size, type: file.type }),
          status: "IMPORTED",
          warningJson: JSON.stringify(["File uploaded as unassigned. Link it to a candidate when ready."])
        }
      });

      await prisma.auditEvent.create({
        data: {
          actorId: auth.user.id,
          eventType: "UNASSIGNED_FILE_UPLOAD",
          entityType: "CandidateFile",
          entityId: candidateFile.id,
          summary: `Uploaded unassigned file ${originalFilename}.`
        }
      });
      created += 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "File upload failed.";
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: "FAILED",
        importedCount: created,
        skippedCount: skipped,
        warningCount: warnings,
        errorCount: 1,
        completedAt: new Date(),
        summaryJson: JSON.stringify({ created, skipped, warnings, error: message })
      }
    });

    return NextResponse.json({ message: `File storage failed: ${message}` }, { status: 500 });
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: { status: "COMPLETED", importedCount: created, skippedCount: skipped, warningCount: warnings, completedAt: new Date() }
  });

  return NextResponse.json({ ok: true, message: `Uploaded ${created} file${created === 1 ? "" : "s"}.`, files: created, skipped, warnings });
}
