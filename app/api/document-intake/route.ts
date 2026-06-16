import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { createCandidateStorageKey, isSupportedCandidateFile, sanitizeFilename } from "@/lib/files/candidate-file-storage";
import { getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { isPrivateFileStorageReady, shouldRequirePrivateFileStorage } from "@/lib/files/file-security";
import { extractFileText } from "@/lib/files/pdf-text";
import { normalizeEmail, normalizeName, normalizePhone } from "@/lib/candidates/normalize";
import { detectDocumentType } from "@/lib/files/document-types";

const maxFileSizeBytes = 25 * 1024 * 1024;

function isFileLike(value: FormDataEntryValue): value is File {
  return typeof value === "object" && "arrayBuffer" in value && "name" in value;
}

function parseEmail(text: string): string | null {
  const m = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return m ? normalizeEmail(m[0]) : null;
}
function parsePhone(text: string): string | null {
  const m = text.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  return m ? normalizePhone(m[0]) : null;
}
function nameFromFilename(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\b(resume|cv|curriculum vitae|application|app|pilot|cover letter|letter|final|updated|copy|signed|\d{4})\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// POST /api/document-intake — multipart: files[] (one per request from the client) + optional
// jobId. Each file is matched to an EXISTING candidate (by email/phone in the file, then by the
// name on the filename) and attached. Unmatched files are stored as unassigned so they appear in
// the candidate Documents "Link" queue. If jobId is given, matched candidates are also linked.
export async function POST(request: Request) {
  const auth = await requireApiPermission("files:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll("files").filter(isFileLike);
    const jobId = (formData.get("jobId") as string | null)?.trim() || null;

    if (files.length === 0) {
      return NextResponse.json({ message: "Choose at least one document." }, { status: 400 });
    }

    const storage = getFileStorageAdapter();
    if (shouldRequirePrivateFileStorage() && !isPrivateFileStorageReady(storage)) {
      return NextResponse.json({ message: "File uploads are disabled until private S3 storage is configured." }, { status: 503 });
    }

    const results: Array<{
      filename: string;
      matched: boolean;
      candidateId: string | null;
      displayName: string | null;
      basis: string | null;
      linkedToJob: boolean;
      error?: string;
    }> = [];

    for (const file of files) {
      const originalFilename = sanitizeFilename(file.name);
      if (!isSupportedCandidateFile(originalFilename) || file.size > maxFileSizeBytes) {
        results.push({ filename: originalFilename, matched: false, candidateId: null, displayName: null, basis: null, linkedToJob: false, error: "Unsupported or larger than 25 MB" });
        continue;
      }

      const bytes = Buffer.from(await file.arrayBuffer());
      const text = await extractFileText(bytes, file.type || null, originalFilename);
      const email = parseEmail(text);
      const phone = parsePhone(text);

      let candidate: { id: string; displayName: string } | null = null;
      let basis: string | null = null;

      if (email) {
        candidate = await prisma.candidate.findFirst({ where: { normalizedEmail: email, archivedAt: null }, select: { id: true, displayName: true } });
        if (candidate) basis = "email";
      }
      if (!candidate && phone) {
        candidate = await prisma.candidate.findFirst({ where: { normalizedPhone: phone, archivedAt: null }, select: { id: true, displayName: true } });
        if (candidate) basis = "phone";
      }
      if (!candidate) {
        const nn = normalizeName(nameFromFilename(originalFilename));
        if (nn) {
          const byName = await prisma.candidate.findMany({ where: { normalizedName: nn, archivedAt: null }, take: 2, select: { id: true, displayName: true } });
          if (byName.length === 1) {
            candidate = byName[0];
            basis = "name";
          } else if (byName.length > 1) {
            basis = "ambiguous";
          }
        }
      }

      if (candidate) {
        const storageKey = createCandidateStorageKey(candidate.id, originalFilename);
        await storage.write({ storageKey, bytes, contentType: file.type || null, metadata: { candidateId: candidate.id, source: "document-intake", uploadedByEmail: auth.user.email ?? "" } });
        await prisma.candidateFile.create({
          data: {
            candidateId: candidate.id,
            originalFilename,
            displayFilename: originalFilename,
            storageKey,
            mimeType: file.type || null,
            sizeBytes: file.size,
            source: "document-intake",
            documentType: detectDocumentType(originalFilename),
            extractedText: text || null,
            textExtractedAt: text ? new Date() : null,
            metadataJson: JSON.stringify({ linkedBy: "document-intake", matchedBy: basis, storageProvider: storage.provider, uploadedByEmail: auth.user.email })
          }
        });

        let linkedToJob = false;
        if (jobId) {
          const already = await prisma.candidateApplication.findFirst({ where: { candidateId: candidate.id, jobId } });
          if (!already) {
            await prisma.candidateApplication.create({ data: { candidateId: candidate.id, jobId, status: "New", stage: "Applied", source: "Document intake", appliedAt: new Date() } });
          }
          linkedToJob = true;
        }

        results.push({ filename: originalFilename, matched: true, candidateId: candidate.id, displayName: candidate.displayName, basis, linkedToJob });
      } else {
        // No confident match — store unassigned so it shows in the Documents "Link" queue.
        const storageKey = createCandidateStorageKey("unassigned", originalFilename);
        await storage.write({ storageKey, bytes, contentType: file.type || null, metadata: { source: "imports-upload", uploadedByEmail: auth.user.email ?? "" } });
        await prisma.candidateFile.create({
          data: {
            candidateId: null,
            originalFilename,
            displayFilename: originalFilename,
            storageKey,
            mimeType: file.type || null,
            sizeBytes: file.size,
            source: "imports-upload",
            documentType: detectDocumentType(originalFilename),
            extractedText: text || null,
            textExtractedAt: text ? new Date() : null,
            metadataJson: JSON.stringify({ assignmentStatus: "unassigned", reason: basis === "ambiguous" ? "multiple name matches" : "no candidate match", storageProvider: storage.provider })
          }
        });
        results.push({ filename: originalFilename, matched: false, candidateId: null, displayName: null, basis: basis === "ambiguous" ? "ambiguous" : "no-match", linkedToJob: false });
      }
    }

    const matched = results.filter((r) => r.matched).length;
    const unmatched = results.filter((r) => !r.matched && !r.error).length;
    return NextResponse.json({ ok: true, matched, unmatched, results });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Unable to process documents." }, { status: 500 });
  }
}
