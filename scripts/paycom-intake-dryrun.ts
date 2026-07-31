/**
 * Dry run for "Upload documents" (POST /api/document-intake) — READ ONLY.
 *
 * Answers the only question that matters before a bulk upload: which of these
 * files would land on the right candidate, and which would drop into the
 * Documents "Link" queue for someone to place by hand?
 *
 * It deliberately DUPLICATES the matching logic from app/api/document-intake/route.ts
 * rather than importing it, because that logic lives inside the POST handler
 * alongside the writes. Keep the two in step: email in the file, then phone in
 * the file, then the name derived from the filename, each needing exactly one
 * live candidate.
 *
 * WRITES NOTHING. No files are stored, no candidateFile rows are created.
 *
 *   npx tsx scripts/paycom-intake-dryrun.ts "C:/path/to/folder-of-pdfs"
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/client/client";
import { detectDocumentType } from "../lib/files/document-types";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

// --- copied from app/api/document-intake/route.ts + lib/candidates/normalize.ts ---

function normalizeEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
function normalizePhone(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";
  const normalized = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return normalized.length === 10 ? normalized : null;
}
function normalizeName(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() || null;
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

async function extractText(bytes: Uint8Array): Promise<string> {
  const { extractText: ex, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await ex(pdf, { mergePages: true });
  return (Array.isArray(text) ? text.join(" ") : text ?? "").replace(/\s+/g, " ").trim();
}

/** The name Paycom prints on the application itself, e.g. "Name Reber, Andrew Thomas". */
function nameFromApplicationBody(text: string): string | null {
  const m = text.match(/Application Information\s+Name\s+(.+?)\s+Primary Phone/);
  if (!m) return null;
  const [last, first] = m[1].split(",").map((s) => s.trim());
  return first && last ? `${first} ${last}` : m[1].trim();
}

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error("Pass the folder of PDFs as the first argument.");

  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pdf")).sort();
  const rows: string[] = [];
  const tally: Record<string, number> = {};

  console.log(`Dry run over ${files.length} files in ${dir}\n`);

  for (const filename of files) {
    const bytes = new Uint8Array(fs.readFileSync(path.join(dir, filename)));
    const text = await extractText(bytes);
    const email = parseEmail(text);
    const phone = parsePhone(text);

    let candidate: { id: string; displayName: string } | null = null;
    let basis: string | null = null;

    if (email) {
      candidate = await prisma.candidate.findFirst({
        where: { normalizedEmail: email, archivedAt: null },
        select: { id: true, displayName: true }
      });
      if (candidate) basis = "email";
    }
    if (!candidate && phone) {
      candidate = await prisma.candidate.findFirst({
        where: { normalizedPhone: phone, archivedAt: null },
        select: { id: true, displayName: true }
      });
      if (candidate) basis = "phone";
    }
    if (!candidate) {
      const nn = normalizeName(nameFromFilename(filename));
      if (nn) {
        const byName = await prisma.candidate.findMany({
          where: { normalizedName: nn, archivedAt: null },
          take: 2,
          select: { id: true, displayName: true }
        });
        if (byName.length === 1) {
          candidate = byName[0];
          basis = "name";
        } else if (byName.length > 1) basis = "ambiguous";
      }
    }

    // Archived fallback — mirrors the block added to the route on Jul 30.
    // READ ONLY here: it reports that a reactivation WOULD happen, and never does one.
    let wouldReactivate = false;
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
      if (archived) {
        candidate = archived;
        wouldReactivate = true;
      }
    }

    // Not part of the endpoint — diagnostics for WHY a file missed, and whether
    // the person exists under another address.
    const bodyName = nameFromApplicationBody(text);
    const nnBody = normalizeName(bodyName);
    const byBodyName = nnBody
      ? await prisma.candidate.findMany({
          where: { normalizedName: nnBody },
          take: 3,
          select: { id: true, displayName: true, primaryEmail: true, archivedAt: true }
        })
      : [];

    const outcome = candidate ? `MATCH (${basis})` : basis === "ambiguous" ? "AMBIGUOUS" : "NO MATCH";
    tally[outcome] = (tally[outcome] ?? 0) + 1;
    if (wouldReactivate) tally["-> would un-archive"] = (tally["-> would un-archive"] ?? 0) + 1;

    console.log(`${outcome.padEnd(22)} ${filename}`);
    console.log(`   doc type: ${detectDocumentType(filename)}${wouldReactivate ? "   *** WOULD UN-ARCHIVE ***" : ""}`);
    console.log(`   app name: ${bodyName ?? "(unreadable)"}   email in file: ${email ?? "(none)"}   phone: ${phone ?? "(none)"}`);
    if (candidate) {
      console.log(`   -> ${candidate.displayName} (${candidate.id})`);
    } else {
      console.log(`   filename-derived name: "${nameFromFilename(filename)}"`);
      if (byBodyName.length) {
        for (const c of byBodyName) {
          console.log(
            `   ~ same name in DB: ${c.displayName} <${c.primaryEmail ?? "no email"}>${c.archivedAt ? " [ARCHIVED]" : ""} (${c.id})`
          );
        }
      } else {
        console.log("   ~ nobody in the DB has that name");
      }
    }
    console.log("");

    rows.push(
      JSON.stringify({
        filename,
        outcome,
        wouldReactivate,
        documentType: detectDocumentType(filename),
        basis,
        applicationName: bodyName,
        emailInFile: email,
        phoneInFile: phone,
        matchedCandidateId: candidate?.id ?? null,
        matchedDisplayName: candidate?.displayName ?? null,
        sameNameInDb: byBodyName.map((c) => ({
          id: c.id,
          displayName: c.displayName,
          primaryEmail: c.primaryEmail,
          archived: Boolean(c.archivedAt)
        }))
      })
    );
  }

  console.log("Summary:", tally);

  const outDir = path.join(process.cwd(), "scripts", "_paycom_intake_output");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "dryrun.jsonl");
  fs.writeFileSync(outFile, rows.join("\n") + "\n");
  console.log(`\nReview file: ${outFile}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
