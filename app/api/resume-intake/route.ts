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
import { normalizeEmail, normalizeName, normalizePhone, splitCandidateName } from "@/lib/candidates/normalize";
import { reactivateArchivedCandidate } from "@/lib/candidates/reactivate";

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

/**
 * The name at the head of a line that then runs on into prose.
 *
 * The lookahead also accepts an ALL-CAPS word, because a common layout is the
 * name followed straight into a section heading — "Yaakov Nissenbaum EDUCATION
 * VOLUNTEER FLIGHT PROFILE". NOT_A_NAME still guards the captured part, so a
 * line that BEGINS with a heading ("FLIGHT EXPERIENCE KILEY LYNCH...") is
 * rejected rather than read as a person called Flight Experience.
 */
const NAME_HEAD = /^([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,2})\s+(?=[A-Z][a-z]|[A-Z]{3,}|\d|\()/;

/**
 * Words that open resume prose and are capitalised, so they look like a surname
 * to any pattern. "Matthew Johnson Active Certified Flight Instructor..." would
 * otherwise be filed under the surname "Active".
 */
const PROSE_OPENERS =
  /^(active|experienced|certified|commercial|airline|professional|dedicated|motivated|highly|seeking|results|accomplished|skilled|current|total|flight|pilot|captain|first|senior|licensed|qualified|safety)$/i;

/**
 * Section headings that follow the name directly on the same line. Allowing an
 * ALL-CAPS word after the name (so "Yaakov Nissenbaum EDUCATION" is found at
 * all) means the heading itself must be trimmed back off, or it becomes the
 * surname — which is worse than not matching.
 */
const SECTION_HEADINGS =
  /^(education|experience|employment|skills?|certifications?|qualifications?|objective|summary|profile|training|licenses?|ratings?|volunteer|awards?|references?|contact|military|aviation|career|highlights?)$/i;

/** Trim trailing prose words and section headings, never below two tokens. */
function trimProse(name: string): string {
  const parts = name.split(/\s+/);
  while (
    parts.length > 2 &&
    (PROSE_OPENERS.test(parts[parts.length - 1]) || SECTION_HEADINGS.test(parts[parts.length - 1]))
  ) {
    parts.pop();
  }
  return parts.join(" ");
}

function looksLikePdf(mimeType: string | null, filename: string): boolean {
  return (mimeType ?? "").includes("pdf") || filename.toLowerCase().endsWith(".pdf");
}

/**
 * Do two readings of a name refer to the same person? Used to decide whether the
 * PDF header name is trustworthy enough to override the filename. Any shared
 * word of three or more letters counts — enough to tell "Adam Kavis Rolph" from
 * "Adam Rolph" (same person, richer) apart from "Human Managment Office Chief"
 * against "ANTONIO PRIETO" (a job title that happened to be set large).
 */
function sharesAName(a: string, b: string): boolean {
  const words = (value: string) =>
    new Set(
      value
        .toLowerCase()
        .replace(/[^a-z\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length >= 3)
    );
  const left = words(a);
  return [...words(b)].some((word) => left.has(word));
}

function nameFromText(text: string): string | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 8);
  for (const line of lines) {
    if (NAME_LINE.test(line) && !NOT_A_NAME.test(line)) return line;
  }
  // A resume whose header is not on its own line: "Matthew Johnson Active
  // Certified Flight Instructor with a strong focus on safety...". The strict
  // whole-line test above cannot match that, and every Paycom import fell
  // through to the filename because of it.
  for (const line of lines) {
    const head = NAME_HEAD.exec(line);
    if (head && !NOT_A_NAME.test(head[1])) {
      const trimmed = trimProse(head[1]);
      if (trimmed.split(/\s+/).length >= 2) return trimmed;
    }
  }
  return null;
}

/**
 * A filename is the LAST resort for a name, and the shapes that arrive here are
 * hostile. A Paycom export sends "(334021)-Haydn Paffi Resume.docx (1) (1).pdf.pdf":
 * a person-id prefix, duplicate markers, and a doubled extension. Stripping only
 * the final extension left a stray "pdf" that became somebody's surname, and the
 * id prefix became their first name — 11 candidates imported as "(333909) pdf".
 */
function nameFromFilename(filename: string): string {
  return filename
    .replace(/^\(\d{4,8}\)[-_\s]*/, "")            // Paycom person-id prefix
    .replace(/(\.[A-Za-z0-9]{2,5})+$/, "")         // ".pdf.pdf", ".docx (1).pdf"
    .replace(/\(\d+\)/g, " ")                      // "(1)" duplicate markers
    .replace(/'s\b/gi, "")                         // "Jared Davis's Resume"
    .replace(/[_\-.]+/g, " ")
    .replace(/\b(resume|resumé|cv|curriculum vitae|application|app|pilot|final|current|updated|copy|new|pdf|docx?)\b/gi, " ")
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/gi, " ")
    .replace(/\(\s*\)/g, " ")                      // parens emptied by the above
    .replace(/\d+/g, " ")                          // any leftover digits
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Reject a "name" that is really a fragment of a filename. Without this the
 * import happily stores "(333909) pdf" as a person and it looks like real data.
 */
function looksLikeAName(value: string): boolean {
  const v = value.trim();
  if (v.length < 3) return false;
  if (/^\(?\d+\)?$/.test(v)) return false;                       // bare id
  if (/\d{3,}/.test(v)) return false;                            // any long number
  if (/^(pdf|docx?|resume|cv|file|document|scan)$/i.test(v)) return false;
  return /[A-Za-z]{2,}/.test(v);
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
      // Both sources are filtered through looksLikeAName, so a filename fragment
      // can never become a person. "Unnamed candidate" is a far better outcome
      // than "(333909) pdf" — it is obviously wrong, so it gets fixed.
      // Typography beats prose. extractFileText collapses all whitespace, so the
      // line-based readers below are really scanning one enormous line and
      // routinely fuse the name to whatever follows it ("Aadan Kenck PO Box").
      // readHeaderName instead takes the largest text at the top of page 1,
      // which is where a resume always puts the name.
      //
      // It is used to CONFIRM or ENRICH, never to overrule on its own: measured
      // over 45 real resumes it agreed with the stored name 24 times, improved
      // on it 6 times (middle names the filename could not know), returned
      // nothing 14 times, and was wrong once — a resume that sets a job title
      // larger than the person's name. Requiring it to share a word with the
      // filename keeps that one out.
      const fromHeader = looksLikePdf(file.type || null, originalFilename)
        ? await readHeaderName(bytes).catch(() => null)
        : null;
      const fromText = nameFromText(text);
      const fromFile = nameFromFilename(originalFilename);

      const corroborated =
        fromHeader && looksLikeAName(fromHeader) && fromFile && sharesAName(fromHeader, fromFile)
          ? fromHeader
          : null;

      const rawName =
        corroborated ?? [fromFile, fromHeader, fromText].find((n) => n && looksLikeAName(n)) ?? "";
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
