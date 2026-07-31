/**
 * Bulk-file a folder of Paycom application PDFs against existing candidates.
 *
 * This is the "Upload documents" button (POST /api/document-intake) run from the
 * command line, and it exists for one reason: the archived-candidate fallback it
 * depends on is not deployed yet, so clicking the real button today would still
 * leave a returning applicant in the archive.
 *
 * It reuses the REAL library code — storage adapter, storage key, text
 * extraction, document-type detection, reactivation — so only the orchestration
 * is duplicated, not the behaviour.
 *
 * SAFETY:
 *   - dry run by default; nothing is written without --apply
 *   - refuses to write unless the storage adapter really is S3, so a
 *     misconfigured run cannot scatter candidate files across a laptop while
 *     writing rows into the shared live database
 *   - --limit N for a small first batch
 *   - every run records an undo file listing the candidateFile ids, the S3 keys
 *     and any candidate it un-archived (with their previous state)
 *
 *   npx tsx scripts/paycom-intake-upload.ts "C:/folder"            # dry run
 *   npx tsx scripts/paycom-intake-upload.ts "C:/folder" --apply --limit 1
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

// Point storage at the real bucket BEFORE anything asks for an adapter. Local
// dev otherwise defaults to writing files onto this machine's disk while the
// database rows — which are shared with production — would point at them.
process.env.FILE_STORAGE_PROVIDER = "s3";
process.env.S3_CANDIDATE_FILES_BUCKET ??= "skyshare-talent-candidate-files";
// us-east-2, NOT the us-east-1 in ~/.aws/config — the bucket really lives in Ohio
// (get-bucket-location says us-east-2) and the wrong region fails the write with
// a 301 PermanentRedirect rather than anything that reads like a region problem.
process.env.AWS_REGION = "us-east-2";

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { createCandidateStorageKey, isSupportedCandidateFile, sanitizeFilename } from "@/lib/files/candidate-file-storage";
import { getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { extractFileText } from "@/lib/files/pdf-text";
import { detectDocumentType } from "@/lib/files/document-types";
import { normalizeEmail, normalizeName, normalizePhone } from "@/lib/candidates/normalize";
import { reactivateArchivedCandidate } from "@/lib/candidates/reactivate";

const maxFileSizeBytes = 25 * 1024 * 1024;

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
    .replace(/^\(\d{4,8}\)[-_\s]*/, "")
    .replace(/(\.[A-Za-z0-9]{2,5})+$/, "")
    .replace(/\(\d+\)/g, " ")
    .replace(/'s\b/gi, "")
    .replace(/[_\-.]+/g, " ")
    .replace(
      /\b(resume|resumé|cv|curriculum vitae|application|app|pilot|cover letter|letter|final|current|updated|copy|signed|new|pdf|docx?)\b/gi,
      " "
    )
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/gi, " ")
    .replace(/\(\s*\)/g, " ")
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Match = { candidate: { id: string; displayName: string } | null; basis: string | null; archived: boolean };

async function findCandidate(email: string | null, phone: string | null, filename: string): Promise<Match> {
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
    const nn = normalizeName(nameFromFilename(filename));
    if (nn) {
      const byName = await prisma.candidate.findMany({ where: { normalizedName: nn, archivedAt: null }, take: 2, select: { id: true, displayName: true } });
      if (byName.length === 1) {
        candidate = byName[0];
        basis = "name";
      } else if (byName.length > 1) basis = "ambiguous";
    }
  }
  if (candidate || basis === "ambiguous") return { candidate, basis, archived: false };

  // Archived fallback — same order, same one-match-only rule.
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
    const nn = normalizeName(nameFromFilename(filename));
    if (nn) {
      const byName = await prisma.candidate.findMany({
        where: { normalizedName: nn, archivedAt: { not: null }, status: { not: "MERGED" } },
        take: 2,
        select: { id: true, displayName: true }
      });
      if (byName.length === 1) {
        archived = byName[0];
        basis = "name (archived)";
      } else if (byName.length > 1) basis = "ambiguous";
    }
  }
  return { candidate: archived, basis, archived: Boolean(archived) };
}

async function main() {
  const dir = process.argv[2];
  const apply = process.argv.includes("--apply");
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;
  if (!dir) throw new Error("Pass the folder of PDFs as the first argument.");

  const storage = getFileStorageAdapter();
  if (apply && storage.provider !== "s3") {
    throw new Error("Refusing to write: storage provider is not S3.");
  }
  const bucket = process.env.S3_CANDIDATE_FILES_BUCKET;
  console.log(`${apply ? "APPLY" : "DRY RUN"} — storage=${storage.provider} bucket=${bucket}\n`);

  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pdf")).sort().slice(0, limit);
  const undo: Array<Record<string, unknown>> = [];
  let filed = 0;
  let reactivatedCount = 0;
  let skipped = 0;

  for (const filename of files) {
    const originalFilename = sanitizeFilename(filename);
    const full = path.join(dir, filename);
    const bytes = fs.readFileSync(full);

    if (!isSupportedCandidateFile(originalFilename) || bytes.byteLength > maxFileSizeBytes) {
      console.log(`SKIP  ${originalFilename} — unsupported or over 25 MB`);
      skipped++;
      continue;
    }

    const text = await extractFileText(bytes, "application/pdf", originalFilename);
    const { candidate, basis, archived } = await findCandidate(parseEmail(text), parsePhone(text), originalFilename);

    if (!candidate) {
      console.log(`SKIP  ${originalFilename} — ${basis === "ambiguous" ? "ambiguous" : "no candidate"} (left alone, NOT filed as unassigned)`);
      skipped++;
      continue;
    }

    // Already filed? Guard against a second run duplicating documents.
    const already = await prisma.candidateFile.findFirst({
      where: { candidateId: candidate.id, originalFilename, source: "document-intake" },
      select: { id: true }
    });
    if (already) {
      console.log(`SKIP  ${originalFilename} — already on ${candidate.displayName} (file ${already.id})`);
      skipped++;
      continue;
    }

    const documentType = detectDocumentType(originalFilename);
    if (!apply) {
      console.log(`WOULD FILE  ${originalFilename}\n   -> ${candidate.displayName} (${basis}) as ${documentType}${archived ? "  *** would un-archive ***" : ""}`);
      continue;
    }

    let reactivation: Awaited<ReturnType<typeof reactivateArchivedCandidate>> = { reactivated: false };
    if (archived) {
      reactivation = await reactivateArchivedCandidate(candidate.id, {
        reason: `a new document ("${originalFilename}") arrived for them and matched by ${basis?.replace(" (archived)", "") ?? "name"}.`,
        source: "document-intake",
        sourceRef: originalFilename
      });
      if (reactivation.reactivated) reactivatedCount++;
    }

    const storageKey = createCandidateStorageKey(candidate.id, originalFilename);
    await storage.write({
      storageKey,
      bytes,
      contentType: "application/pdf",
      metadata: { candidateId: candidate.id, source: "document-intake" }
    });

    const created = await prisma.candidateFile.create({
      data: {
        candidateId: candidate.id,
        originalFilename,
        displayFilename: originalFilename,
        storageKey,
        mimeType: "application/pdf",
        sizeBytes: bytes.byteLength,
        source: "document-intake",
        documentType,
        extractedText: text || null,
        textExtractedAt: text ? new Date() : null,
        metadataJson: JSON.stringify({
          linkedBy: "document-intake (bulk script)",
          matchedBy: basis,
          reactivatedFromArchive: reactivation.reactivated || undefined,
          storageProvider: storage.provider
        })
      },
      select: { id: true }
    });

    filed++;
    console.log(`FILED ${originalFilename}\n   -> ${candidate.displayName} (${basis}) as ${documentType}${reactivation.reactivated ? "  *** UN-ARCHIVED ***" : ""}  file=${created.id}`);

    undo.push({
      candidateFileId: created.id,
      storageKey,
      candidateId: candidate.id,
      displayName: candidate.displayName,
      filename: originalFilename,
      reactivated: reactivation.reactivated,
      previousStage: reactivation.previousStage ?? null,
      previousArchivedAt: reactivation.previousArchivedAt?.toISOString() ?? null
    });
  }

  console.log(`\nfiled=${filed} reactivated=${reactivatedCount} skipped=${skipped}`);

  if (apply && undo.length) {
    const outDir = path.join(process.cwd(), "scripts", "_paycom_intake_output");
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `undo-${undo.length}-files.json`);
    fs.writeFileSync(outFile, JSON.stringify(undo, null, 2));
    console.log(`Undo record: ${outFile}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
