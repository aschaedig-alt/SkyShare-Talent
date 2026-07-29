import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createCandidateStorageKey,
  isSupportedCandidateFile,
  sanitizeFilename
} from "@/lib/files/candidate-file-storage";
import { getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { isPrivateFileStorageReady, shouldRequirePrivateFileStorage } from "@/lib/files/file-security";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { extractFileText } from "@/lib/files/pdf-text";
import { detectDocumentType } from "@/lib/files/document-types";
import { MAX_UPLOAD_BYTES, tooLargeMessage } from "@/lib/files/upload-limits";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// The 25 MB this used to claim was never real in production: a hosted
// serverless function rejects the body over ~4.5 MB before this handler runs,
// so the check never fired and the caller got an unexplained failure. See
// lib/files/upload-limits.ts.
const maxFileSizeBytes = MAX_UPLOAD_BYTES;

function isFileLike(value: FormDataEntryValue): value is File {
  return typeof value === "object" && "arrayBuffer" in value && "name" in value;
}

function storageMetadata(values: Record<string, string | null | undefined>) {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1]))
  );
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireApiPermission("files:write");

    if (!auth.ok) {
  return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
}

    const { id } = await context.params;
    const candidate = await prisma.candidate.findUnique({
      where: { id },
      select: { id: true }
    });

    if (!candidate) {
      return NextResponse.json({ message: "Candidate not found." }, { status: 404 });
    }

    const formData = await request.formData();
    const files = formData.getAll("files").filter(isFileLike);
    const storage = getFileStorageAdapter();

    if (shouldRequirePrivateFileStorage() && !isPrivateFileStorageReady(storage)) {
      return NextResponse.json(
        {
          message:
            "Real file uploads are disabled until private S3 storage is configured for this hosted environment."
        },
        { status: 503 }
      );
    }

    if (files.length === 0) {
      return NextResponse.json({ message: "Choose at least one file to upload." }, { status: 400 });
    }

    const createdFiles = [];

    for (const file of files) {
      const originalFilename = sanitizeFilename(file.name);

      if (!isSupportedCandidateFile(originalFilename)) {
        return NextResponse.json(
          { message: `${originalFilename} is not a supported candidate file type.` },
          { status: 400 }
        );
      }

      if (file.size > maxFileSizeBytes) {
        return NextResponse.json(
          { message: tooLargeMessage(originalFilename, file.size) },
          { status: 400 }
        );
      }

      const storageKey = createCandidateStorageKey(id, originalFilename);
      const bytes = Buffer.from(await file.arrayBuffer());
      await storage.write({
        storageKey,
        bytes,
        contentType: file.type || null,
        metadata: storageMetadata({
          candidateId: id,
          source: "candidate-profile-upload",
          uploadedByUserId: auth.user.id,
          uploadedByEmail: auth.user.email
        })
      });

      // Extract searchable text (best-effort; never blocks the upload)
      const extractedText = await extractFileText(bytes, file.type || null, originalFilename);

      const linkedAt = new Date().toISOString();
      const created = await prisma.candidateFile.create({
        data: {
          candidateId: id,
          originalFilename,
          displayFilename: originalFilename,
          storageKey,
          mimeType: file.type || null,
          sizeBytes: file.size,
          source: "candidate-profile-upload",
          documentType: detectDocumentType(originalFilename),
          extractedText: extractedText || null,
          textExtractedAt: extractedText ? new Date() : null,
          metadataJson: JSON.stringify({
            linkedBy: "direct-candidate-profile",
            linkedAt,
            storageProvider: storage.provider,
            uploadedByUserId: auth.user.id,
            uploadedByEmail: auth.user.email,
            authMode: auth.user.authMode
          })
        },
        select: {
          id: true,
          displayFilename: true,
          originalFilename: true,
          mimeType: true,
          sizeBytes: true
        }
      });

      createdFiles.push(created);
    }

    await prisma.auditEvent.create({
      data: {
        actorId: auth.user.id,
        eventType: "CANDIDATE_FILE_UPLOAD",
        entityType: "Candidate",
        entityId: id,
        summary: `Uploaded ${createdFiles.length} candidate file(s).`,
        payloadJson: JSON.stringify({
          fileIds: createdFiles.map((file) => file.id),
          source: "candidate-profile-upload",
          storageProvider: storage.provider,
          uploadedByEmail: auth.user.email,
          authMode: auth.user.authMode
        })
      }
    });

    return NextResponse.json({
      ok: true,
      message: `Uploaded ${createdFiles.length} file${createdFiles.length === 1 ? "" : "s"}.`,
      files: createdFiles
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Unable to upload candidate file." }, { status: 500 });
  }
}
