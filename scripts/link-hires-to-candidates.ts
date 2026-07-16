/**
 * Link existing NewHire (employee / pre-onboarding) records back to their
 * Candidate records. None of the legacy hires carry a candidateId, so their
 * resume, interviews, and recruiting history are disconnected from the person.
 *
 * Matching (most confident first):
 *   EMAIL  — hire ssEmail/personalEmail matches a candidate's email exactly
 *   NAME   — normalized name matches exactly ONE candidate
 *   AMBIGUOUS / NONE — reported, never written
 *
 * Dry run by default (writes nothing, emits a review CSV).
 *   npx tsx scripts/link-hires-to-candidates.ts                 # report only
 *   npx tsx scripts/link-hires-to-candidates.ts --apply         # EMAIL matches only
 *   npx tsx scripts/link-hires-to-candidates.ts --apply --include-name
 *   npx tsx scripts/link-hires-to-candidates.ts --undo          # revert what --apply wrote
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/client/client";
import { normalizeEmail, normalizeName } from "../lib/candidates/normalize";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const INCLUDE_NAME = argv.includes("--include-name");
const UNDO = argv.includes("--undo");

const OUT_DIR = "C:\\Users\\Recruiter\\resume-archive\\_link_output";
const REVIEW_CSV = join(OUT_DIR, "hire-candidate-links.csv");
const APPLIED_JSON = join(OUT_DIR, "hire-candidate-links.applied.json");

function csvCell(v: unknown) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function undo() {
  if (!existsSync(APPLIED_JSON)) {
    console.log("Nothing to undo — no applied-links file found.");
    await prisma.$disconnect();
    return;
  }
  const ids = JSON.parse(readFileSync(APPLIED_JSON, "utf8")) as string[];
  console.log(`UNDO — clearing candidateId on ${ids.length} hires linked by this script.`);
  let n = 0;
  for (const id of ids) {
    await prisma.newHire.update({ where: { id }, data: { candidateId: null } }).catch(() => {});
    if (++n % 100 === 0) console.log(`  ...${n}/${ids.length}`);
  }
  console.log(`Done. Reverted ${n}.`);
  await prisma.$disconnect();
}

async function run() {
  const hires = await prisma.newHire.findMany({
    where: { candidateId: null },
    select: { id: true, name: true, stage: true, position: true, ssEmail: true, personalEmail: true }
  });
  const cands = await prisma.candidate.findMany({
    where: { status: { not: "MERGED" } },
    select: { id: true, displayName: true, status: true, origin: true, primaryEmail: true, normalizedEmail: true }
  });

  // Index candidates by email and by normalized name (tracking name collisions).
  const byEmail = new Map<string, typeof cands>();
  const byName = new Map<string, typeof cands>();
  for (const c of cands) {
    const e = c.normalizedEmail ?? normalizeEmail(c.primaryEmail);
    if (e) byEmail.set(e, [...(byEmail.get(e) ?? []), c]);
    const n = normalizeName(c.displayName);
    if (n) byName.set(n, [...(byName.get(n) ?? []), c]);
  }

  type Row = {
    hireId: string; hireName: string; hireStage: string; hirePosition: string | null;
    candidateId: string; candidateName: string; candidateStatus: string; candidateOrigin: string;
    confidence: "EMAIL" | "NAME"; reason: string;
  };
  const rows: Row[] = [];
  let ambiguous = 0, none = 0;
  const ambiguousSamples: string[] = [];

  for (const h of hires) {
    const emails = [normalizeEmail(h.ssEmail), normalizeEmail(h.personalEmail)].filter(Boolean) as string[];
    let hit: (typeof cands)[number] | null = null;
    let confidence: "EMAIL" | "NAME" | null = null;
    let reason = "";

    for (const e of emails) {
      const m = byEmail.get(e);
      if (m && m.length === 1) { hit = m[0]; confidence = "EMAIL"; reason = `email ${e}`; break; }
      if (m && m.length > 1) { ambiguous++; reason = `email ${e} matches ${m.length} candidates`; break; }
    }

    if (!hit && !reason) {
      const n = normalizeName(h.name);
      const m = n ? byName.get(n) : undefined;
      if (m && m.length === 1) { hit = m[0]; confidence = "NAME"; reason = `unique name match`; }
      else if (m && m.length > 1) {
        ambiguous++;
        if (ambiguousSamples.length < 5) ambiguousSamples.push(`${h.name} → ${m.length} candidates`);
      } else none++;
    }

    if (hit && confidence) {
      rows.push({
        hireId: h.id, hireName: h.name, hireStage: h.stage, hirePosition: h.position,
        candidateId: hit.id, candidateName: hit.displayName, candidateStatus: hit.status,
        candidateOrigin: hit.origin, confidence, reason
      });
    }
  }

  const byConf = { EMAIL: rows.filter((r) => r.confidence === "EMAIL").length, NAME: rows.filter((r) => r.confidence === "NAME").length };
  console.log(`\nUnlinked hires: ${hires.length}   Candidates considered: ${cands.length}\n`);
  console.log(`Matched by EMAIL ....... ${byConf.EMAIL}`);
  console.log(`Matched by NAME ........ ${byConf.NAME}`);
  console.log(`Ambiguous (skipped) .... ${ambiguous}`);
  console.log(`No match ............... ${none}`);
  if (ambiguousSamples.length) {
    console.log(`\nAmbiguous samples:`);
    ambiguousSamples.forEach((s) => console.log(`  ${s}`));
  }
  console.log(`\nMatched-candidate origin mix:`);
  const originMix: Record<string, number> = {};
  for (const r of rows) originMix[`${r.candidateOrigin}/${r.candidateStatus}`] = (originMix[`${r.candidateOrigin}/${r.candidateStatus}`] ?? 0) + 1;
  for (const [k, v] of Object.entries(originMix)) console.log(`  ${k}: ${v}`);

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const cols: (keyof Row)[] = ["confidence", "reason", "hireName", "hireStage", "hirePosition", "candidateName", "candidateStatus", "candidateOrigin", "hireId", "candidateId"];
  writeFileSync(REVIEW_CSV, [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\r\n"), "utf8");
  console.log(`\nReview CSV → ${REVIEW_CSV}`);

  if (!APPLY) {
    console.log(`\nDRY RUN — nothing written. Re-run with --apply (EMAIL only) or --apply --include-name.`);
    await prisma.$disconnect();
    return;
  }

  const toApply = rows.filter((r) => r.confidence === "EMAIL" || (INCLUDE_NAME && r.confidence === "NAME"));
  console.log(`\nAPPLYING ${toApply.length} links${INCLUDE_NAME ? " (email + name)" : " (email only)"}...`);
  const applied: string[] = [];
  let n = 0;
  for (const r of toApply) {
    try {
      await prisma.newHire.update({ where: { id: r.hireId }, data: { candidateId: r.candidateId } });
      applied.push(r.hireId);
    } catch (e) {
      console.warn(`  failed ${r.hireName}: ${(e as Error).message.slice(0, 60)}`);
    }
    if (++n % 100 === 0) console.log(`  ...${n}/${toApply.length}`);
  }
  writeFileSync(APPLIED_JSON, JSON.stringify(applied), "utf8");
  console.log(`\nLinked ${applied.length}. Undo: npx tsx scripts/link-hires-to-candidates.ts --undo`);
  await prisma.$disconnect();
}

(UNDO ? undo() : run()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
