import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { join } from "path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client/client";
import { readCsvObjects } from "../lib/archive/import/csv";
import { parseStringArray } from "../lib/json";
import { normalizeEmail, normalizePhone, normalizeName } from "../lib/candidates/normalize";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const DEFAULT_DIR =
  "C:\\Users\\Recruiter\\Downloads\\Jazz Stuff\\skyshare_export_20250616\\skyshare_export_20250616\\data_records";
const DIR = process.argv.find((a, i) => i >= 2 && !a.startsWith("--")) || process.env.JAZZ_DIR || DEFAULT_DIR;

function isDemo(email: string, first: string, last: string) {
  return email.toLowerCase().endsWith("@jazzhr.com") || `${first} ${last}`.toLowerCase().includes("jazzhr");
}

// Rebuild prospect_id -> candidateId (same grouping the main importer used).
async function buildProspectMap(): Promise<Map<string, string>> {
  const candidates = readCsvObjects(join(DIR, "candidates.csv"));
  const groupHead = new Map<string, string>();
  const keyToHead = new Map<string, string>();
  for (const c of candidates) {
    const first = c.prospect_first_name ?? "";
    const last = c.prospect_last_name ?? "";
    const email = c.prospect_email ?? "";
    const phone = c.prospect_phone ?? "";
    if (isDemo(email, first, last)) continue;
    const key =
      normalizeEmail(email) ? `e:${normalizeEmail(email)}` :
      normalizePhone(phone) ? `p:${normalizePhone(phone)}` :
      normalizeName([first, last].filter(Boolean).join(" ")) ? `n:${normalizeName([first, last].filter(Boolean).join(" "))}` :
      `id:${c.prospect_id}`;
    if (!keyToHead.has(key)) keyToHead.set(key, c.prospect_id);
    groupHead.set(c.prospect_id, keyToHead.get(key)!);
  }
  const dbRows = await prisma.candidate.findMany({
    where: { jazzCandidateNumber: { not: null } },
    select: { id: true, jazzCandidateNumber: true }
  });
  const headToCandidate = new Map<string, string>();
  for (const r of dbRows) if (r.jazzCandidateNumber) headToCandidate.set(r.jazzCandidateNumber, r.id);

  const map = new Map<string, string>();
  for (const [pid, head] of groupHead) {
    const cid = headToCandidate.get(head);
    if (cid) map.set(pid, cid);
  }
  return map;
}

async function main() {
  console.log("\n================ BACKFILL TAGS ================\n");

  // Tag cache: normalized label -> tagId (upsert once per unique label).
  const tagIdByNorm = new Map<string, string>();
  async function ensureTag(label: string): Promise<string | null> {
    const normalized = normalizeName(label);
    if (!normalized) return null;
    if (tagIdByNorm.has(normalized)) return tagIdByNorm.get(normalized)!;
    const tag = await prisma.tag.upsert({
      where: { normalized },
      create: { label: label.trim(), normalized },
      update: {}
    });
    tagIdByNorm.set(normalized, tag.id);
    return tag.id;
  }

  type Link = { candidateId: string; tagId: string; source: string };
  const links: Link[] = [];

  // 1) Manual tags from each candidate's tagsJson
  const candidates = await prisma.candidate.findMany({ select: { id: true, tagsJson: true } });
  let manualTags = 0;
  for (const c of candidates) {
    for (const label of parseStringArray(c.tagsJson)) {
      const tagId = await ensureTag(label);
      if (tagId) {
        links.push({ candidateId: c.id, tagId, source: "MANUAL" });
        manualTags++;
      }
    }
  }

  // 2) Jazz categories from candidate_categories.csv
  let jazzTags = 0;
  let jazzUnmatched = 0;
  try {
    const prospectMap = await buildProspectMap();
    const categories = readCsvObjects(join(DIR, "candidate_categories.csv"));
    for (const row of categories) {
      const cid = prospectMap.get(row.prospect_id ?? "");
      if (!cid) {
        jazzUnmatched++;
        continue;
      }
      const tagId = await ensureTag(row.category_name ?? "");
      if (tagId) {
        links.push({ candidateId: cid, tagId, source: "JAZZ" });
        jazzTags++;
      }
    }
  } catch (e) {
    console.log(`(Skipping Jazz categories — ${String(e)})`);
  }

  // 3) Insert links (composite PK candidateId+tagId dedupes via skipDuplicates)
  let written = 0;
  for (let i = 0; i < links.length; i += 1000) {
    const res = await prisma.candidateTag.createMany({ data: links.slice(i, i + 1000), skipDuplicates: true });
    written += res.count;
  }

  console.log(`Unique tags ............. ${tagIdByNorm.size}`);
  console.log(`Manual tag links ........ ${manualTags}`);
  console.log(`Jazz category links ..... ${jazzTags} (${jazzUnmatched} unmatched)`);
  console.log(`CandidateTag rows added .. ${written} (duplicates skipped)`);
  console.log("");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
