/**
 * DRY RUN for a bulk resume upload against one job.
 *
 * Reads a folder of resumes and reports, per file, exactly what
 * POST /api/resume-intake WOULD do — without writing anything. It imports the
 * same parsing module the route uses (lib/candidates/resume-fields), so this is
 * a prediction, not a second implementation that can drift.
 *
 * It exists because the real upload has two silent failure modes:
 *
 *   1. extractFileText returns "" for .doc/.docx and for scanned image PDFs.
 *      Those files upload and look successful, but the person is invisible to
 *      keyword search forever. Nothing in the UI says so. 29% of the files
 *      already in the database (1,817 of 6,306) have no extracted text.
 *
 *   2. The route dedupes on email/phone ONLY, never on name. A returning
 *      applicant whose resume has no parseable contact detail becomes a SECOND
 *      profile. This script also checks by normalized name, so those show up
 *      here as WOULD-DUPLICATE before they are created rather than after.
 *
 * READ-ONLY. It opens the shared live database but only ever reads from it.
 *
 *   npx tsx scripts/amt-resume-preflight.ts "C:/folder" --job <jobId>
 *   npx tsx scripts/amt-resume-preflight.ts "C:/folder" --job <jobId> --since 2026-08-06
 *   ... --keyword "Elevate"
 *
 * --since keeps a re-download separate from whatever was already sitting in the
 * folder, matched on the file's BIRTH time. The AMT batch landed in a folder
 * that already held 15 unrelated resumes from May; without --since they would
 * have been filed onto the job too.
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { extractFileText } from "@/lib/files/pdf-text";
import { readHeaderName } from "@/lib/files/pdf-form";
import { isSupportedCandidateFile, sanitizeFilename } from "@/lib/files/candidate-file-storage";
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

const maxFileSizeBytes = 25 * 1024 * 1024;

/**
 * "Any Elevate-named aviation company" — Elevate Jet, Elevate Aviation, Elevate
 * Charter, Elevate Holdings. Deliberately NOT a bare "Elevate": of 57 files in
 * the database containing that word, most are the verb ("elevate team morale",
 * "elevated the customer dining experience"), and the proper nouns include
 * Elevate Surgical and a mortgage "Elevate Team" that are not aviation at all.
 */
const KEYWORD_RE = /Elevat(?:e|ed)\s+(Aviation|Jet|Jets|Air|Aero|Charter|Flight|Holdings|Aviation Group|MRO|Maintenance)/i;

type Row = {
  filename: string;
  flags: string[];
  displayName: string;
  email: string | null;
  phone: string | null;
  textChars: number;
  matchBasis: string;
  matchedCandidate: string;
  alreadyOnJob: boolean;
  keywordHit: string;
};

function csvCell(value: string | number | boolean): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const dir = process.argv[2];
  const jobArg = process.argv.indexOf("--job");
  const jobId = jobArg > -1 ? process.argv[jobArg + 1] : null;
  const sinceArg = process.argv.indexOf("--since");
  const since = sinceArg > -1 ? new Date(process.argv[sinceArg + 1]) : null;

  if (!dir) throw new Error("Pass the folder of resumes as the first argument.");
  if (!jobId) throw new Error("Pass --job <jobId>.");

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, title: true, status: true, department: true, _count: { select: { applications: true } } }
  });
  if (!job) throw new Error(`No job with id ${jobId}.`);
  console.log(`DRY RUN — nothing will be written.`);
  console.log(`Job: "${job.title}" (${job.status}, ${job.department}) — ${job._count.applications} applications today`);
  if (since) console.log(`Only files created on/after ${since.toISOString()}`);

  const all = fs.readdirSync(dir).filter((f) => {
    const full = path.join(dir, f);
    if (!fs.statSync(full).isFile()) return false;
    if (since && fs.statSync(full).birthtime < since) return false;
    return true;
  }).sort();

  console.log(`${all.length} files selected\n`);

  const rows: Row[] = [];
  // Detects two files in THIS batch that resolve to the same person — the route
  // would happily create one profile and then attach the second file to it, or
  // create two, depending on whether a contact detail was parsed.
  const seenInBatch = new Map<string, string[]>();

  for (const filename of all) {
    const originalFilename = sanitizeFilename(filename);
    const full = path.join(dir, filename);
    const bytes = fs.readFileSync(full);
    const flags: string[] = [];

    if (!isSupportedCandidateFile(originalFilename)) {
      rows.push({ filename: originalFilename, flags: ["UNSUPPORTED-TYPE"], displayName: "", email: null, phone: null, textChars: 0, matchBasis: "", matchedCandidate: "", alreadyOnJob: false, keywordHit: "" });
      continue;
    }
    if (bytes.byteLength > maxFileSizeBytes) {
      rows.push({ filename: originalFilename, flags: ["OVER-25MB"], displayName: "", email: null, phone: null, textChars: 0, matchBasis: "", matchedCandidate: "", alreadyOnJob: false, keywordHit: "" });
      continue;
    }

    const text = await extractFileText(bytes, null, originalFilename);
    if (text.trim().length === 0) flags.push("NO-TEXT-UNSEARCHABLE");
    else if (text.trim().length < 200) flags.push("THIN-TEXT");

    const email = parseEmail(text);
    const phone = parsePhone(text);
    const rawName = resolveRawName({
      fromHeader: looksLikePdf(null, originalFilename) ? await readHeaderName(bytes).catch(() => null) : null,
      fromText: nameFromText(text),
      fromFile: nameFromFilename(originalFilename)
    });
    const split = splitCandidateName(rawName);
    const displayName =
      split.displayName && split.displayName !== "Unnamed candidate" && looksLikeAName(split.displayName)
        ? split.displayName
        : "Unnamed candidate";
    if (displayName === "Unnamed candidate") flags.push("NO-NAME");
    if (!email && !phone) flags.push("NO-CONTACT-DEDUPE-BLIND");

    // What the ROUTE would match on: email or phone, nothing else.
    const routeMatch =
      email || phone
        ? await prisma.candidate.findFirst({
            where: {
              OR: [
                email ? { normalizedEmail: email } : undefined,
                phone ? { normalizedPhone: phone } : undefined
              ].filter(Boolean) as Array<{ normalizedEmail: string } | { normalizedPhone: string }>
            },
            select: { id: true, displayName: true, archivedAt: true }
          })
        : null;

    // What a NAME check would additionally find — the duplicates the route makes.
    const nn = normalizeName(displayName);
    const nameMatches =
      !routeMatch && nn && displayName !== "Unnamed candidate"
        ? await prisma.candidate.findMany({ where: { normalizedName: nn }, select: { id: true, displayName: true, archivedAt: true }, take: 3 })
        : [];

    let matchBasis = "";
    let matchedCandidate = "";
    let matchedId: string | null = null;
    if (routeMatch) {
      matchBasis = email && routeMatch ? "email/phone" : "phone";
      matchedCandidate = routeMatch.displayName;
      matchedId = routeMatch.id;
      flags.push("REUSES-EXISTING");
      if (routeMatch.archivedAt) flags.push("WOULD-UNARCHIVE");
    } else if (nameMatches.length > 0) {
      matchBasis = `name-only (${nameMatches.length})`;
      matchedCandidate = nameMatches.map((c) => c.displayName).join(" | ");
      matchedId = nameMatches[0].id;
      flags.push("WOULD-DUPLICATE");
    } else {
      matchBasis = "new";
      flags.push("CREATES-NEW");
    }

    let alreadyOnJob = false;
    if (matchedId) {
      alreadyOnJob = Boolean(
        await prisma.candidateApplication.findFirst({ where: { candidateId: matchedId, jobId }, select: { id: true } })
      );
      if (alreadyOnJob) flags.push("ALREADY-ON-JOB");
      const dupFile = await prisma.candidateFile.findFirst({
        where: { candidateId: matchedId, originalFilename },
        select: { id: true }
      });
      if (dupFile) flags.push("FILE-ALREADY-ATTACHED");
    }

    const kw = KEYWORD_RE.exec(text);
    const keywordHit = kw ? kw[0].replace(/\s+/g, " ") : "";

    const key = nn ?? `?${originalFilename}`;
    seenInBatch.set(key, [...(seenInBatch.get(key) ?? []), originalFilename]);

    rows.push({ filename: originalFilename, flags, displayName, email, phone, textChars: text.trim().length, matchBasis, matchedCandidate, alreadyOnJob, keywordHit });
  }

  for (const [key, files] of seenInBatch) {
    if (files.length > 1 && !key.startsWith("?")) {
      for (const r of rows) if (files.includes(r.filename)) r.flags.push("SAME-PERSON-TWICE-IN-BATCH");
    }
  }

  const outDir = path.join(process.cwd(), "scripts", "_preflight_output");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `preflight-${all.length}-files.csv`);
  const header = ["filename", "flags", "displayName", "email", "phone", "textChars", "matchBasis", "matchedCandidate", "alreadyOnJob", "keywordHit"];
  fs.writeFileSync(
    outFile,
    [header.join(","), ...rows.map((r) => [r.filename, r.flags.join(" "), r.displayName, r.email ?? "", r.phone ?? "", r.textChars, r.matchBasis, r.matchedCandidate, r.alreadyOnJob, r.keywordHit].map(csvCell).join(","))].join("\n")
  );

  const count = (flag: string) => rows.filter((r) => r.flags.includes(flag)).length;
  console.log("=== what the upload would do ===");
  console.log(`  create a new candidate      ${count("CREATES-NEW")}`);
  console.log(`  reuse an existing candidate ${count("REUSES-EXISTING")}`);
  console.log(`  un-archive somebody         ${count("WOULD-UNARCHIVE")}`);
  console.log(`  already on this job         ${count("ALREADY-ON-JOB")}`);
  console.log(`  file already attached       ${count("FILE-ALREADY-ATTACHED")}`);
  console.log("\n=== problems to fix BEFORE uploading ===");
  console.log(`  DUPLICATE a person who is already here (name matches, no contact match)  ${count("WOULD-DUPLICATE")}`);
  console.log(`  no extracted text — invisible to keyword search forever                  ${count("NO-TEXT-UNSEARCHABLE")}`);
  console.log(`  suspiciously little text                                                 ${count("THIN-TEXT")}`);
  console.log(`  no name parsed — would import as "Unnamed candidate"                     ${count("NO-NAME")}`);
  console.log(`  no email AND no phone — dedupe is blind for these                        ${count("NO-CONTACT-DEDUPE-BLIND")}`);
  console.log(`  same person twice within this batch                                      ${count("SAME-PERSON-TWICE-IN-BATCH")}`);
  console.log(`  unsupported type / oversized                                             ${count("UNSUPPORTED-TYPE") + count("OVER-25MB")}`);

  const hits = rows.filter((r) => r.keywordHit);
  console.log(`\n=== keyword: Elevate-named aviation company (in this batch) — ${hits.length} ===`);
  for (const h of hits) console.log(`  ${h.displayName}  [${h.keywordHit}]  ${h.filename}`);

  console.log("\nProblem rows:");
  for (const r of rows) {
    const bad = r.flags.filter((f) => ["WOULD-DUPLICATE", "NO-TEXT-UNSEARCHABLE", "NO-NAME", "SAME-PERSON-TWICE-IN-BATCH", "UNSUPPORTED-TYPE", "OVER-25MB", "THIN-TEXT"].includes(f));
    if (bad.length) console.log(`  ${bad.join(" ")}  "${r.displayName}"  ${r.filename}${r.matchedCandidate ? `  -> ${r.matchedCandidate}` : ""}`);
  }

  console.log(`\nReview file: ${outFile}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
