import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { existsSync, readFileSync } from "fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client/client";
import { extractFileText } from "../lib/files/pdf-text";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

// Restrict to resume-tagged docs by default; pass --all to do every Jazz PDF.
const ALL = process.argv.includes("--all");
const UNDO = process.argv.includes("--undo");

async function undo() {
  const where = ALL ? { source: "JAZZ" } : { source: "JAZZ", documentType: "Resume" };
  const res = await prisma.candidateFile.updateMany({ where, data: { extractedText: null, textExtractedAt: null } });
  console.log(`\nCleared extracted text on ${res.count} files.\n`);
  await prisma.$disconnect();
}

async function run() {
  const where = ALL ? { source: "JAZZ" } : { source: "JAZZ", documentType: "Resume" };
  const files = await prisma.candidateFile.findMany({
    where,
    select: { id: true, originalFilename: true, mimeType: true, metadataJson: true }
  });
  console.log(`\n=== EXTRACTING ${ALL ? "ALL JAZZ PDFS" : "RESUME PDFS"} — ${files.length} candidate files ===\n`);

  let extracted = 0, empty = 0, missing = 0, notPdf = 0, errors = 0, processed = 0;

  for (const f of files) {
    processed++;
    let path: string | null = null;
    try {
      path = JSON.parse(f.metadataJson ?? "{}").originalPath ?? null;
    } catch {
      /* ignore */
    }
    if (!path || !existsSync(path)) { missing++; continue; }
    if (!path.toLowerCase().endsWith(".pdf")) { notPdf++; continue; }
    try {
      const text = await extractFileText(readFileSync(path), f.mimeType, f.originalFilename);
      if (text.trim().length > 0) {
        await prisma.candidateFile.update({ where: { id: f.id }, data: { extractedText: text, textExtractedAt: new Date() } });
        extracted++;
      } else {
        empty++;
      }
    } catch {
      errors++;
    }
    if (processed % 100 === 0) console.log(`  ...${processed}/${files.length} (extracted ${extracted})`);
  }

  console.log(`\n--- Done ---`);
  console.log(`Extracted (has text) .... ${extracted}`);
  console.log(`Empty / scanned ......... ${empty}`);
  console.log(`Not a PDF ............... ${notPdf}`);
  console.log(`Missing on disk ......... ${missing}`);
  console.log(`Errors .................. ${errors}`);
  console.log(`\nResumes are now searchable by content. Undo: tsx prisma/extract-jazz-resumes.ts --undo\n`);
  await prisma.$disconnect();
}

(UNDO ? undo() : run()).catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
