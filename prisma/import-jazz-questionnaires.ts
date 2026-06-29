import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { join } from "path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client/client";
import { readCsvObjects } from "../lib/archive/import/csv";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const DEFAULT_DIR =
  "C:/Users/Recruiter/Downloads/Jazz Stuff/skyshare_export_20250616/skyshare_export_20250616/data_records";
const DIR = process.argv.find((a, i) => i >= 2 && !a.startsWith("--")) || process.env.JAZZ_DIR || DEFAULT_DIR;
const COMMIT = process.argv.includes("--commit");
const UNDO = process.argv.includes("--undo");
const FORCE = process.argv.includes("--force");

async function undo() {
  const res = await prisma.candidateQuestionnaireAnswer.deleteMany({ where: { origin: "JAZZ" } });
  console.log(`\nDeleted ${res.count} questionnaire answers.\n`);
  await prisma.$disconnect();
}

async function run() {
  console.log(`\n================ JAZZ QUESTIONNAIRES — ${COMMIT ? "COMMIT" : "DRY RUN"} ================\n`);

  if (COMMIT && !FORCE) {
    const existing = await prisma.candidateQuestionnaireAnswer.count({ where: { origin: "JAZZ" } });
    if (existing > 0) {
      console.log(`Aborting: ${existing} answers already imported. Re-run with --undo first, or pass --force.`);
      await prisma.$disconnect();
      return;
    }
  }

  // application_id -> { candidateId, applicationId }
  const apps = await prisma.candidateApplication.findMany({
    where: { origin: "JAZZ", jazzApplicationNumber: { not: null } },
    select: { id: true, candidateId: true, jazzApplicationNumber: true }
  });
  const appMap = new Map<string, { candidateId: string; applicationId: string }>();
  for (const a of apps) if (a.jazzApplicationNumber) appMap.set(a.jazzApplicationNumber, { candidateId: a.candidateId, applicationId: a.id });

  const rows = readCsvObjects(join(DIR, "candidate_questionnaires.csv"));
  let matched = 0;
  let unmatched = 0;
  let empty = 0;
  const buffer: Record<string, unknown>[] = [];

  for (const r of rows) {
    const link = appMap.get(r.application_id ?? "");
    if (!link) {
      unmatched++;
      continue;
    }
    if (!r.answer?.trim() && !r.question?.trim()) {
      empty++;
      continue;
    }
    matched++;
    buffer.push({
      candidateId: link.candidateId,
      applicationId: link.applicationId,
      questionnaireName: r.questionnaire_name || null,
      question: r.question || null,
      answer: r.answer || null,
      origin: "JAZZ"
    });
  }

  console.log("Questionnaire rows ... " + rows.length);
  console.log("Linked ............... " + matched);
  console.log("Unmatched ............ " + unmatched);
  console.log("Empty ................ " + empty);

  if (COMMIT) {
    let written = 0;
    for (let i = 0; i < buffer.length; i += 1000) {
      const res = await prisma.candidateQuestionnaireAnswer.createMany({ data: buffer.slice(i, i + 1000) as never });
      written += res.count;
      if (written % 5000 === 0) console.log(`  ...written ${written}`);
    }
    console.log("\nWritten .............. " + written);
    console.log("\nTo undo:  tsx prisma/import-jazz-questionnaires.ts --undo");
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
