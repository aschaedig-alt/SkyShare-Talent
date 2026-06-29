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

function parseDate(s: string | undefined): Date | null {
  if (!s || !s.trim()) return null;
  const d = new Date(s.trim());
  return isNaN(d.getTime()) ? null : d;
}
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

async function run() {
  console.log(`\n================ JAZZ INTERVIEW ANSWERS — ${COMMIT ? "COMMIT" : "DRY RUN"} ================\n`);

  const prospectMap = await buildProspectMap();
  const iv = readCsvObjects(join(DIR, "candidate_interviews.csv"));

  // Group source rows into sessions, mirroring the main importer's grouping.
  const sessions = new Map<string, { cid: string; when: Date; title: string; rows: Record<string, string>[] }>();
  for (const r of iv) {
    const cid = prospectMap.get(r.prospect_id ?? "");
    const when = parseDate(r.interviewed_at);
    if (!cid || !when) continue;
    const title = r.interview_name || "Interview";
    const key = `${cid}|${when.toISOString()}|${title}`;
    if (!sessions.has(key)) sessions.set(key, { cid, when, title, rows: [] });
    sessions.get(key)!.rows.push(r);
  }

  // Map existing Jazz interviews by the same key.
  const interviews = await prisma.interview.findMany({
    where: { source: "JAZZ" },
    select: { id: true, candidateId: true, startDateTime: true, title: true }
  });
  const ivByKey = new Map<string, string>();
  for (const i of interviews) ivByKey.set(`${i.candidateId}|${i.startDateTime.toISOString()}|${i.title}`, i.id);

  let updated = 0;
  let noMatch = 0;
  for (const [key, s] of sessions) {
    const interviewId = ivByKey.get(key);
    if (!interviewId) { noMatch++; continue; }
    const first = s.rows[0];
    const qa = s.rows
      .filter((r) => (r.question || "").trim())
      .map((r) => `Q: ${r.question}\nA: ${r.response || "—"}${r.response_rating ? `  [${r.response_rating}]` : ""}`)
      .join("\n\n");
    const header = (first.interview_notes || first.decision_text || "").trim();
    const notes = [header, qa ? `Responses:\n${qa}` : ""].filter(Boolean).join("\n\n");
    if (!notes) continue;
    if (COMMIT) await prisma.interview.update({ where: { id: interviewId }, data: { notes } });
    updated++;
  }

  console.log("Sessions in source ... " + sessions.size);
  console.log(COMMIT ? "Interviews updated ... " + updated : "Would update ......... " + updated);
  console.log("No matching interview  " + noMatch);
  console.log(COMMIT ? "" : "\nDRY RUN — nothing written. Re-run with --commit.");
  console.log("");
  await prisma.$disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
