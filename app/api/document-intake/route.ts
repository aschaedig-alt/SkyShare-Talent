import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { createCandidateStorageKey, isSupportedCandidateFile, sanitizeFilename } from "@/lib/files/candidate-file-storage";
import { getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { isPrivateFileStorageReady, shouldRequirePrivateFileStorage } from "@/lib/files/file-security";
import { extractFileText } from "@/lib/files/pdf-text";
import { normalizeEmail, normalizeName, normalizePhone } from "@/lib/candidates/normalize";
import { reactivateArchivedCandidate } from "@/lib/candidates/reactivate";
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
/**
 * Used here to MATCH an existing candidate, so a bad result costs a missed
 * match rather than bad data — but a Paycom export names files
 * "(334021)-Haydn Paffi Resume.docx (1) (1).pdf.pdf", and leaving the id prefix
 * and the doubled extension in place means the name never matches anybody.
 * Kept in step with the same function in resume-intake.
 */
function nameFromFilename(filename: string): string {
  return filename
    .replace(/^\(\d{4,8}\)[-_\s]*/, "")            // Paycom person-id prefix
    .replace(/(\.[A-Za-z0-9]{2,5})+$/, "")         // ".pdf.pdf", ".docx (1).pdf"
    .replace(/\(\d+\)/g, " ")                      // "(1)" duplicate markers
    .replace(/'s\b/gi, "")                         // "Jared Davis's Resume"
    .replace(/[_\-.]+/g, " ")
    .replace(/\b(resume|resumé|cv|curriculum vitae|application|app|pilot|cover letter|letter|final|current|updated|copy|signed|new|pdf|docx?)\b/gi, " ")
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/gi, " ")
    .replace(/\(\s*\)/g, " ")                      // parens emptied by the above
    .replace(/\d+/g, " ")                          // any leftover digits
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
      /** They were in the archive and this document brought them back. */
      reactivated?: boolean;
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

      // Nobody ACTIVE matched — now try the archive, because people re-apply and a
      // new application makes them a current applicant again. Deliberately a
      // fallback rather than a change to the tiers above: an archived namesake
      // must never turn somebody's clean live match into an ambiguous one.
      // MERGED records are excluded — that person lives under another id now.
      let reactivated = false;
      if (!candidate && basis !== "ambiguous") {
        let archived: { id: string; displayName: string } | null = null;
        if (email) {
          archived = await prisma.candidate.findFirst({
            where: { normalizedEmail: email, archivedAt: { not: null }, status: { not: "MERGED" } },
            select: { id: true, displayName: true }
          });
          if (archived) basis = "email (archived)";
        }
        if (!archived && phone) {
          archived = await prisma.candidate.findFirst({
            where: { normalizedPhone: phone, archivedAt: { not: null }, status: { not: "MERGED" } },
            select: { id: true, displayName: true }
          });
          if (archived) basis = "phone (archived)";
        }
        if (!archived) {
          const nn = normalizeName(nameFromFilename(originalFilename));
          if (nn) {
            const byName = await prisma.candidate.findMany({
              where: { normalizedName: nn, archivedAt: { not: null }, status: { not: "MERGED" } },
              take: 2,
              select: { id: true, displayName: true }
            });
            // One archived namesake is a returning applicant; two is a guess.
            if (byName.length === 1) {
              archived = byName[0];
              basis = "name (archived)";
            } else if (byName.length > 1) {
              basis = "ambiguous";
            }
          }
        }

        if (archived) {
          const result = await reactivateArchivedCandidate(archived.id, {
            reason: `a new document ("${originalFilename}") arrived for them and matched by ${basis?.replace(" (archived)", "") ?? "name"}.`,
            source: "document-intake",
            sourceRef: originalFilename
          });
          reactivated = result.reactivated;
          candidate = archived;
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
            metadataJson: JSON.stringify({ linkedBy: "document-intake", matchedBy: basis, reactivatedFromArchive: reactivated || undefined, storageProvider: storage.provider, uploadedByEmail: auth.user.email })
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

        results.push({ filename: originalFilename, matched: true, candidateId: candidate.id, displayName: candidate.displayName, basis, linkedToJob, reactivated });
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
    const reactivated = results.filter((r) => r.reactivated).length;
    return NextResponse.json({ ok: true, matched, unmatched, reactivated, results });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Unable to process documents." }, { status: 500 });
  }
}
