import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import {
  createCandidateStorageKey,
  isSupportedCandidateFile,
  sanitizeFilename
} from "@/lib/files/candidate-file-storage";
import { getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { isPrivateFileStorageReady, shouldRequirePrivateFileStorage } from "@/lib/files/file-security";
import { extractFileText } from "@/lib/files/pdf-text";
import { readHeaderName } from "@/lib/files/pdf-form";
import { normalizeName, splitCandidateName } from "@/lib/candidates/normalize";
import {
  looksLikeAName,
  looksLikePdf,
  nameFromFilename,
  nameFromText,
  parseEmail,
  parsePhone,
  resolveRawName
} from "@/lib/candidates/resume-fields";
import { reactivateArchivedCandidate } from "@/lib/candidates/reactivate";

const maxFileSizeBytes = 25 * 1024 * 1024;

function isFileLike(value: FormDataEntryValue): value is File {
  return typeof value === "object" && "arrayBuffer" in value && "name" in value;
}

// Name/email/phone parsing lives in lib/candidates/resume-fields.ts so the
// pre-flight dry run (scripts/amt-resume-preflight.ts) predicts exactly what
// this route will do. Do not reimplement it in either place.

// POST /api/resume-intake — multipart: files[] (+ optional jobId).
// For each resume: extract text, parse name/email/phone, create (or reuse) a candidate,
// attach the file to them, and optionally link them to a job. One step, no typing.
export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll("files").filter(isFileLike);
    const jobId = (formData.get("jobId") as string | null)?.trim() || null;

    if (files.length === 0) {
      return NextResponse.json({ message: "Choose at least one resume to upload." }, { status: 400 });
    }

    const storage = getFileStorageAdapter();
    if (shouldRequirePrivateFileStorage() && !isPrivateFileStorageReady(storage)) {
      return NextResponse.json(
        { message: "File uploads are disabled until private S3 storage is configured for this environment." },
        { status: 503 }
      );
    }

    const results: Array<{
      filename: string;
      candidateId: string | null;
      displayName: string;
      email: string | null;
      phone: string | null;
      reused: boolean;
      /** They were archived and this resume brought them back. */
      reactivated?: boolean;
      linkedToJob: boolean;
      error?: string;
    }> = [];

    for (const file of files) {
      const originalFilename = sanitizeFilename(file.name);

      if (!isSupportedCandidateFile(originalFilename)) {
        results.push({ filename: originalFilename, candidateId: null, displayName: "", email: null, phone: null, reused: false, linkedToJob: false, error: "Unsupported file type" });
        continue;
      }
      if (file.size > maxFileSizeBytes) {
        results.push({ filename: originalFilename, candidateId: null, displayName: "", email: null, phone: null, reused: false, linkedToJob: false, error: "Larger than 25 MB" });
        continue;
      }

      const bytes = Buffer.from(await file.arrayBuffer());
      const text = await extractFileText(bytes, file.type || null, originalFilename);

      const email = parseEmail(text);
      const phone = parsePhone(text);
      // Every reading is filtered through looksLikeAName, so a filename fragment
      // can never become a person. "Unnamed candidate" is a far better outcome
      // than "(333909) pdf" — it is obviously wrong, so it gets fixed.
      // See resolveRawName for why the PDF header name only ever corroborates.
      const rawName = resolveRawName({
        fromHeader: looksLikePdf(file.type || null, originalFilename)
          ? await readHeaderName(bytes).catch(() => null)
          : null,
        fromText: nameFromText(text),
        fromFile: nameFromFilename(originalFilename)
      });
      const split = splitCandidateName(rawName);
      const displayName =
        split.displayName && split.displayName !== "Unnamed candidate" && looksLikeAName(split.displayName)
          ? split.displayName
          : "Unnamed candidate";

      // Create or reuse the candidate (dedupe by email/phone).
      const existing =
        email || phone
          ? await prisma.candidate.findFirst({
              where: {
                OR: [email ? { normalizedEmail: email } : undefined, phone ? { normalizedPhone: phone } : undefined].filter(Boolean) as Array<
                  { normalizedEmail: string } | { normalizedPhone: string }
                >
              }
            })
          : null;

      const candidate =
        existing ??
        (await prisma.candidate.create({
          data: {
            firstName: split.firstName,
            lastName: split.lastName,
            displayName,
            normalizedName: normalizeName(displayName),
            primaryEmail: email,
            normalizedEmail: email,
            primaryPhone: phone,
            normalizedPhone: phone,
            status: "ACTIVE",
            stage: "New",
            source: "Resume intake"
          }
        }));

      // A resume from someone we had archived means they are applying again.
      // This lookup has always found archived records (it has no archivedAt
      // filter) and then left them archived, so the new resume and application
      // landed on a profile nobody can see — which is exactly what happened to
      // Matthew Higginbotham on Jul 30.
      let reactivated = false;
      if (existing) {
        const result = await reactivateArchivedCandidate(existing.id, {
          reason: `a new resume ("${originalFilename}") was uploaded for them.`,
          source: "resume-intake",
          sourceRef: originalFilename
        });
        reactivated = result.reactivated;
      }

      if (!existing) {
        if (email) {
          await prisma.candidateContact.create({ data: { candidateId: candidate.id, type: "EMAIL", value: email, normalized: email, isPrimary: true, source: "Resume intake" } });
        }
        if (phone) {
          await prisma.candidateContact.create({ data: { candidateId: candidate.id, type: "PHONE", value: phone, normalized: phone, isPrimary: true, source: "Resume intake" } });
        }
      }

      // Store the resume and attach it to the candidate.
      const storageKey = createCandidateStorageKey(candidate.id, originalFilename);
      await storage.write({
        storageKey,
        bytes,
        contentType: file.type || null,
        metadata: { candidateId: candidate.id, source: "resume-intake", uploadedByEmail: auth.user.email ?? "" }
      });
      await prisma.candidateFile.create({
        data: {
          candidateId: candidate.id,
          originalFilename,
          displayFilename: originalFilename,
          storageKey,
          mimeType: file.type || null,
          sizeBytes: file.size,
          source: "resume-intake",
          documentType: "Resume",
          extractedText: text || null,
          textExtractedAt: text ? new Date() : null,
          metadataJson: JSON.stringify({ linkedBy: "resume-intake", storageProvider: storage.provider, uploadedByEmail: auth.user.email })
        }
      });

      let linkedToJob = false;
      if (jobId) {
        const already = await prisma.candidateApplication.findFirst({ where: { candidateId: candidate.id, jobId } });
        if (!already) {
          await prisma.candidateApplication.create({
            data: { candidateId: candidate.id, jobId, status: "New", stage: "Applied", source: "Resume intake", appliedAt: new Date() }
          });
        }
        linkedToJob = true;
      }

      results.push({ filename: originalFilename, candidateId: candidate.id, displayName: candidate.displayName, email, phone, reused: Boolean(existing), linkedToJob, reactivated });
    }

    const created = results.filter((r) => r.candidateId && !r.reused).length;
    const reused = results.filter((r) => r.reused).length;
    const reactivated = results.filter((r) => r.reactivated).length;
    return NextResponse.json({ ok: true, created, reused, reactivated, results });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Unable to process resumes." }, { status: 500 });
  }
}
