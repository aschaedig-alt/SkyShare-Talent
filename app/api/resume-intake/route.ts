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
import { normalizeEmail, normalizeName, normalizePhone, splitCandidateName } from "@/lib/candidates/normalize";

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

const NAME_LINE = /^[A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+){1,2}$/;
const NOT_A_NAME = /(resume|curriculum|vitae|cv|profile|summary|objective|experience|references|contact)/i;

function nameFromText(text: string): string | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 8);
  for (const line of lines) {
    if (NAME_LINE.test(line) && !NOT_A_NAME.test(line)) return line;
  }
  return null;
}

function nameFromFilename(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\b(resume|cv|curriculum vitae|application|app|pilot|final|updated|copy|\d{4})\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
      const rawName = nameFromText(text) || nameFromFilename(originalFilename);
      const split = splitCandidateName(rawName);
      const displayName = split.displayName && split.displayName !== "Unnamed candidate" ? split.displayName : nameFromFilename(originalFilename) || "Unnamed candidate";

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
          extractedText: text || null,
          textExtractedAt: text ? new Date() : null,
          metadataJson: JSON.stringify({ documentType: "resume", linkedBy: "resume-intake", storageProvider: storage.provider, uploadedByEmail: auth.user.email })
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

      results.push({ filename: originalFilename, candidateId: candidate.id, displayName: candidate.displayName, email, phone, reused: Boolean(existing), linkedToJob });
    }

    const created = results.filter((r) => r.candidateId && !r.reused).length;
    const reused = results.filter((r) => r.reused).length;
    return NextResponse.json({ ok: true, created, reused, results });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Unable to process resumes." }, { status: 500 });
  }
}
