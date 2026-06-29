import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { join } from "path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client/client";
import { readCsvObjects } from "../lib/archive/import/csv";
import { normalizeEmail, normalizePhone, normalizeName } from "../lib/candidates/normalize";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const DEFAULT_DIR =
  "C:/Users/Recruiter/Downloads/Jazz Stuff/skyshare_export_20250616/skyshare_export_20250616/data_records";
const DIR = process.argv.find((a, i) => i >= 2 && !a.startsWith("--")) || process.env.JAZZ_DIR || DEFAULT_DIR;
const COMMIT = process.argv.includes("--commit");
const UNDO = process.argv.includes("--undo");
const FORCE = process.argv.includes("--force");
const SOURCE = "JAZZ_TEXT_RESUME";

function isDemo(email: string, first: string, last: string) {
  return email.toLowerCase().endsWith("@jazzhr.com") || `${first} ${last}`.toLowerCase().includes("jazzhr");
}

async function buildProspectMap(): Promise<Map<string, string>> {
  const candidates = readCsvObjects(join(DIR, "candidates.csv"));
  const groupHead = new Map<string, string>();
  const keyToHead = new Map<string, string>();
  for (const c of candidates) {
    const first = c.prospect_first_name ?? "", last = c.prospect_last_name ?? "";
    if (isDemo(c.prospect_email ?? "", first, last)) continue;
    const key =
      normalizeEmail(c.prospect_email ?? "") ? `e:${normalizeEmail(c.prospect_email ?? "")}` :
      normalizePhone(c.prospect_phone ?? "") ? `p:${normalizePhone(c.prospect_phone ?? "")}` :
      normalizeName([first, last].filter(Boolean).join(" ")) ? `n:${normalizeName([first, last].filter(Boolean).join(" "))}` :
      `id:${c.prospect_id}`;
    if (!keyToHead.has(key)) keyToHead.set(key, c.prospect_id);
    groupHead.set(c.prospect_id, keyToHead.get(key)!);
  }
  const dbRows = await prisma.candidate.findMany({ where: { jazzCandidateNumber: { not: null } }, select: { id: true, jazzCandidateNumber: true } });
  const headToCandidate = new Map<string, string>();
  for (const r of dbRows) if (r.jazzCandidateNumber) headToCandidate.set(r.jazzCandidateNumber, r.id);
  const map = new Map<string, string>();
  for (const [pid, head] of groupHead) { const cid = headToCandidate.get(head); if (cid) map.set(pid, cid); }
  return map;
}

function isPlaceholder(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t.length < 40 || t.startsWith("there is no resume");
}

async function undo() {
  const res = await prisma.candidateFile.deleteMany({ where: { source: SOURCE } });
  console.log(`\nDeleted ${res.count} text-resume files.\n`);
  await prisma.$disconnect();
}

async function run() {
  console.log(`\n================ JAZZ TEXT RESUMES — ${COMMIT ? "COMMIT" : "DRY RUN"} ================\n`);

  if (COMMIT && !FORCE) {
    const existing = await prisma.candidateFile.count({ where: { source: SOURCE } });
    if (existing > 0) {
      console.log(`Aborting: ${existing} text resumes already imported. Re-run with --undo first, or pass --force.`);
      await prisma.$disconnect();
      return;
    }
  }

  const prospectMap = await buildProspectMap();
  const rows = readCsvObjects(join(DIR, "candidate_text_resumes.csv"));

  let withText = 0;
  let placeholder = 0;
  let unmatched = 0;
  const buffer: Record<string, unknown>[] = [];

  for (const r of rows) {
    const text = (r["resume text"] ?? "").trim();
    if (!text || isPlaceholder(text)) {
      placeholder++;
      continue;
    }
    const cid = prospectMap.get(r.prospect_id ?? "");
    if (!cid) {
      unmatched++;
      continue;
    }
    withText++;
    buffer.push({
      candidateId: cid,
      originalFilename: "jazz-text-resume.txt",
      displayFilename: "Resume (text, from Jazz)",
      mimeType: "text/plain",
      documentType: "Resume",
      source: SOURCE,
      extractedText: text,
      textExtractedAt: new Date(),
      metadataJson: JSON.stringify({ storageProvider: "jazz-text-resume" })
    });
  }

  console.log("Text-resume rows ..... " + rows.length);
  console.log("Real resume text ..... " + withText);
  console.log("Placeholder/empty .... " + placeholder);
  console.log("Unmatched ............ " + unmatched);

  if (COMMIT) {
    let written = 0;
    for (let i = 0; i < buffer.length; i += 500) {
      const res = await prisma.candidateFile.createMany({ data: buffer.slice(i, i + 500) as never });
      written += res.count;
    }
    console.log("\nWritten .............. " + written + "  (searchable via candidate search)");
    console.log("\nTo undo:  tsx prisma/import-jazz-text-resumes.ts --undo");
  } else {
    console.log("\nDRY RUN — nothing written. Re-run with --commit.");
  }
  console.log("");
  await prisma.$disconnect();
}

(UNDO ? undo() : run()).catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
