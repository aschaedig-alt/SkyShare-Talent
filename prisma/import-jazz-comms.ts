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
  "C:\\Users\\Recruiter\\Downloads\\Jazz Stuff\\skyshare_export_20250616\\skyshare_export_20250616\\data_records";
const DIR = process.argv.find((a, i) => i >= 2 && !a.startsWith("--")) || process.env.JAZZ_DIR || DEFAULT_DIR;
const COMMIT = process.argv.includes("--commit");
const UNDO = process.argv.includes("--undo");
const FORCE = process.argv.includes("--force");
const CHUNK = 1000;

function parseDate(s: string | undefined): Date | null {
  if (!s || !s.trim()) return null;
  const d = new Date(s.trim());
  return isNaN(d.getTime()) ? null : d;
}

function isDemo(email: string, first: string, last: string) {
  return email.toLowerCase().endsWith("@jazzhr.com") || `${first} ${last}`.toLowerCase().includes("jazzhr");
}

// Rebuild prospect_id -> candidateId for every prospect id (including the ones
// that were collapsed into a single person during the main import).
async function buildProspectMap(): Promise<Map<string, string>> {
  const candidates = readCsvObjects(join(DIR, "candidates.csv"));
  // Same Pass A grouping the main importer used: group by email > phone > name.
  const groupHead = new Map<string, string>(); // prospectId -> head prospectId
  const keyToHead = new Map<string, string>();
  for (const c of candidates) {
    const first = c.prospect_first_name ?? "";
    const last = c.prospect_last_name ?? "";
    const email = c.prospect_email ?? "";
    const phone = c.prospect_phone ?? "";
    if (isDemo(email, first, last)) continue;
    const nEmail = normalizeEmail(email);
    const nPhone = normalizePhone(phone);
    const nName = normalizeName([first, last].filter(Boolean).join(" "));
    const key = nEmail ? `e:${nEmail}` : nPhone ? `p:${nPhone}` : nName ? `n:${nName}` : `id:${c.prospect_id}`;
    const head = keyToHead.get(key) ?? c.prospect_id;
    if (!keyToHead.has(key)) keyToHead.set(key, head);
    groupHead.set(c.prospect_id, head);
  }

  const dbRows = await prisma.candidate.findMany({
    where: { jazzCandidateNumber: { not: null } },
    select: { id: true, jazzCandidateNumber: true }
  });
  const headToCandidate = new Map<string, string>();
  for (const row of dbRows) if (row.jazzCandidateNumber) headToCandidate.set(row.jazzCandidateNumber, row.id);

  const prospectToCandidate = new Map<string, string>();
  for (const [pid, head] of groupHead.entries()) {
    const cid = headToCandidate.get(head);
    if (cid) prospectToCandidate.set(pid, cid);
  }
  return prospectToCandidate;
}

async function undo() {
  console.log("\n=== UNDO communications import ===");
  const res = await prisma.candidateCommunication.deleteMany({ where: { origin: "JAZZ" } });
  console.log(`Deleted ${res.count} communications.\n`);
  await prisma.$disconnect();
}

async function run() {
  console.log(`\n================ JAZZ COMMUNICATIONS — ${COMMIT ? "COMMIT" : "DRY RUN"} ================`);
  console.log(`Source: ${join(DIR, "communications.csv")}\n`);

  if (COMMIT && !FORCE) {
    const existing = await prisma.candidateCommunication.count({ where: { origin: "JAZZ" } });
    if (existing > 0) {
      console.log(`Aborting: ${existing} Jazz communications already imported. Re-run with --undo first, or pass --force.`);
      await prisma.$disconnect();
      return;
    }
  }

  const source = await prisma.historicalSource.findFirst({ where: { system: "JAZZ" }, orderBy: { createdAt: "desc" } });
  const prospectToCandidate = await buildProspectMap();
  const comms = readCsvObjects(join(DIR, "communications.csv"));

  let matched = 0;
  let unmatched = 0;
  let empty = 0;
  let withCandidate = 0;
  const buffer: Record<string, unknown>[] = [];
  let written = 0;

  async function flush() {
    if (!COMMIT || buffer.length === 0) {
      buffer.length = 0;
      return;
    }
    await prisma.candidateCommunication.createMany({ data: buffer as never });
    written += buffer.length;
    buffer.length = 0;
    if (written % 20000 === 0) console.log(`  ...written ${written}`);
  }

  for (const row of comms) {
    const cid = prospectToCandidate.get(row.prospect_id ?? "");
    if (!cid) {
      unmatched++;
      continue;
    }
    if (!row.subject && !row.body) {
      empty++;
      continue;
    }
    matched++;
    withCandidate++;
    buffer.push({
      candidateId: cid,
      jazzCommId: row.comm_id || null,
      jazzProspectId: row.prospect_id || null,
      senderEmail: row.sender_email || null,
      recipientEmail: row.recipient_email || null,
      cc: row.cc || null,
      bcc: row.bcc || null,
      subject: row.subject || null,
      body: row.body || null,
      sentAt: parseDate(row.sent),
      origin: "JAZZ",
      historicalSourceId: source?.id ?? null
    });
    if (buffer.length >= CHUNK) await flush();
  }
  await flush();

  console.log("\nRows in communications.csv .... " + comms.length);
  console.log("Linked to a candidate ......... " + matched);
  console.log("Unmatched (no profile) ........ " + unmatched);
  console.log("Skipped empty ................. " + empty);
  if (COMMIT) {
    console.log("\nWritten ....................... " + written);
    console.log(`\nTo undo:  tsx prisma/import-jazz-comms.ts --undo`);
  } else {
    console.log("\nDRY RUN — nothing written. Re-run with --commit to import.");
  }
  console.log("");
  await prisma.$disconnect();
}

(UNDO ? undo() : run()).catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
