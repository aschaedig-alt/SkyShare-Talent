import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";

type CompleteUpload = {
  rowNumber?: number;
  originalFilename?: string;
  displayFilename?: string;
  storageKey?: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
};

type CompleteRequest = {
  batchId?: string;
  uploads?: CompleteUpload[];
  failed?: Array<{ filename?: string; message?: string }>;
};

export async function POST(request: Request) {
  const auth = await requireApiPermission("files:write");
  if (!auth.ok) return auth.response;

  const payload = (await request.json()) as CompleteRequest;
  if (!payload.batchId) return NextResponse.json({ message: "Missing upload batch ID." }, { status: 400 });

  const batch = await prisma.importBatch.findUnique({ where: { id: payload.batchId } });
  if (!batch || batch.sourceType !== "UNASSIGNED_FILE_UPLOAD") {
    return NextResponse.json({ message: "Upload batch was not found." }, { status: 404 });
  }

  const uploads = payload.uploads ?? [];
  const failed = payload.failed ?? [];
  let created = 0;
  let warnings = failed.length;

  for (const upload of uploads) {
    if (!upload.storageKey || !upload.originalFilename || !upload.displayFilename) {
      warnings += 1;
      continue;
    }

    const candidateFile = await prisma.candidateFile.create({
      data: {
        candidateId: null,
        originalFilename: upload.originalFilename,
        displayFilename: upload.displayFilename,
        storageKey: upload.storageKey,
        mimeType: upload.mimeType ?? null,
        sizeBytes: upload.sizeBytes ?? null,
        source: "imports-upload",
        metadataJson: JSON.stringify({ assignmentStatus: "unassigned", storageProvider: "s3" })
      }
    });

    await prisma.importRow.create({
      data: {
        importBatchId: batch.id,
        rowNumber: upload.rowNumber ?? created + 1,
        rawJson: JSON.stringify(upload),
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
        summary: `Uploaded unassigned file ${upload.originalFilename}.`
      }
    });

    created += 1;
  }

  for (const [index, failure] of failed.entries()) {
    await prisma.importRow.create({
      data: {
        importBatchId: batch.id,
        rowNumber: uploads.length + index + 1,
        rawJson: JSON.stringify(failure),
        status: "FAILED",
        errorJson: JSON.stringify([failure.message ?? "Upload failed."])
      }
    });
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      status: failed.length ? (created ? "COMPLETED_WITH_WARNINGS" : "FAILED") : "COMPLETED",
      importedCount: created,
      skippedCount: failed.length,
      warningCount: warnings,
      errorCount: failed.length,
      completedAt: new Date(),
      summaryJson: JSON.stringify({ created, failed: failed.length })
    }
  });

  return NextResponse.json({
    ok: failed.length === 0,
    message: `Uploaded ${created} file${created === 1 ? "" : "s"}.${failed.length ? ` ${failed.length} failed.` : ""}`,
    files: created,
    skipped: failed.length,
    warnings
  }, { status: created ? 200 : 500 });
}
