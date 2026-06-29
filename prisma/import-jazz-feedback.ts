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
const SOURCE = "JAZZ_FEEDBACK";

function parseDate(d: string | undefined, t: string | undefined): Date | null {
  if (!d || !d.trim()) return null;
  const iso = t && t.trim() ? `${d.trim()}T${t.trim()}` : d.trim();
  const date = new Date(iso);
  return isNaN(date.getTime()) ? null : date;
}

async function undo() {
  const res = await prisma.candidateNote.deleteMany({ where: { source: SOURCE } });
  console.log(`\nDeleted ${res.count} imported interview-feedback notes.\n`);
  await prisma.$disconnect();
}

async function run() {
  console.log(`\n================ JAZZ INTERVIEW FEEDBACK — ${COMMIT ? "COMMIT" : "DRY RUN"} ================\n`);

  if (COMMIT && !FORCE) {
    const existing = await prisma.candidateNote.count({ where: { source: SOURCE } });
    if (existing > 0) {
      console.log(`Aborting: ${existing} feedback notes already imported. Re-run with --undo first, or pass --force.`);
      await prisma.$disconnect();
      return;
    }
  }

  // application_id (projob_...) -> candidateId, via jazzApplicationNumber
  const apps = await prisma.candidateApplication.findMany({
    where: { origin: "JAZZ", jazzApplicationNumber: { not: null } },
    select: { jazzApplicationNumber: true, candidateId: true }
  });
  const appToCandidate = new Map<string, string>();
  for (const a of apps) if (a.jazzApplicationNumber) appToCandidate.set(a.jazzApplicationNumber, a.candidateId);

  // user id -> "First Last"
  const users = readCsvObjects(join(DIR, "users_and_roles.csv"));
  const userName = new Map<string, string>();
  for (const u of users) {
    const name = [u.usr_first_name, u.usr_last_name].filter(Boolean).join(" ").trim();
    if (u.usr_account_id) userName.set(u.usr_account_id, name);
  }

  const feedback = readCsvObjects(join(DIR, "candidate_feedback.csv"));
  let matched = 0;
  let unmatched = 0;
  const rows: Record<string, unknown>[] = [];

  for (const f of feedback) {
    const cid = appToCandidate.get(f.application_id ?? "");
    if (!cid) {
      unmatched++;
      continue;
    }
    if (!f.feedback_text?.trim()) continue;
    matched++;
    const author = userName.get(f.author_id ?? "") || "Jazz";
    rows.push({
      candidateId: cid,
      body: `${f.feedback_text.trim()}\n\n— ${author}`,
      source: SOURCE,
      sourceRef: f.application_id || null,
      createdAt: parseDate(f.feedback_date, f.feedback_time) ?? undefined
    });
  }

  console.log("Feedback rows ........ " + feedback.length);
  console.log("Linked to candidate .. " + matched);
  console.log("Unmatched ............ " + unmatched);

  if (COMMIT) {
    let written = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const res = await prisma.candidateNote.createMany({ data: rows.slice(i, i + 500) as never });
      written += res.count;
    }
    console.log("\nWritten .............. " + written);
    console.log("\nTo undo:  tsx prisma/import-jazz-feedback.ts --undo");
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
