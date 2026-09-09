/**
 * Repair drifted normalizedTitle values on Job and PilotRequirement.
 *
 * WHY THIS EXISTS. normalizedTitle is what the rename clash check, the importer's
 * find-an-existing-job lookup and duplicate detection all read. It is supposed to
 * be title.toLowerCase() with runs of whitespace collapsed. On 2026-09-09 a scan of
 * all 72 live jobs found one row where it had silently rotted: "Phenom 100 First
 * Officer" was stored as "phenom 100 fir t officer", an s turned into a space. A
 * row like that is invisible to every one of those lookups, so the job cannot be
 * found by name, cannot clash on a rename, and cannot cluster as a duplicate. It
 * fails quietly, which is why it went unnoticed.
 *
 * WHAT IT WILL AND WILL NOT TOUCH. A row counts as CORRUPTED only when the stored
 * value still differs from the recomputed one after collapsing whitespace on both
 * sides. That deliberately excludes the other thing this scan turns up: several
 * writers use title.trim().toLowerCase() with no whitespace collapse (see
 * app/api/pilot-requirements/route.ts and the requirement branch of
 * app/api/recruiting-jobs/[id]/route.ts), so a title with a double space is stored
 * differently depending on which route wrote it. That is a code inconsistency to
 * settle deliberately, not damage to repair behind somebody's back, so those rows
 * are REPORTED and left alone.
 *
 * DRY RUN BY DEFAULT. Prints and writes a review file. Pass --apply to write, which
 * also records every previous value in the review file so the change can be undone
 * by hand. There is one shared live database, so this matters.
 *
 *   npx tsx scripts/fix-job-normalized-titles.ts
 *   npx tsx scripts/fix-job-normalized-titles.ts --apply
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { normalizeJobTitle } from "@/lib/jobs/duplicate-detection";

const APPLY = process.argv.includes("--apply");
const OUT = path.join(process.cwd(), "scripts", "_normalized-title-repair.md");

/** Whitespace-insensitive comparison, so convention differences are not "damage". */
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

type Row = { id: string; title: string; normalizedTitle: string | null };
type Finding = { table: string; id: string; title: string; stored: string | null; expected: string };

function classify(table: string, rows: Row[]) {
  const corrupted: Finding[] = [];
  const whitespaceOnly: Finding[] = [];
  for (const r of rows) {
    const expected = normalizeJobTitle(r.title);
    const stored = r.normalizedTitle;
    if (stored === expected) continue;
    const finding: Finding = { table, id: r.id, title: r.title, stored, expected };
    // A null or empty stored value is simply missing, and recomputing it is safe.
    if (stored === null || stored === "" || squash(stored) !== expected) corrupted.push(finding);
    else whitespaceOnly.push(finding);
  }
  return { corrupted, whitespaceOnly };
}

async function main() {
  const jobs = await prisma.job.findMany({ select: { id: true, title: true, normalizedTitle: true } });
  const reqs = await prisma.pilotRequirement.findMany({ select: { id: true, title: true, normalizedTitle: true } });

  const j = classify("Job", jobs);
  const p = classify("PilotRequirement", reqs);
  const corrupted = [...j.corrupted, ...p.corrupted];
  const whitespaceOnly = [...j.whitespaceOnly, ...p.whitespaceOnly];

  const lines: string[] = [];
  const say = (s: string) => {
    lines.push(s);
    console.log(s);
  };

  say(`# normalizedTitle repair — ${APPLY ? "APPLIED" : "DRY RUN"}`);
  say(`generated: ${new Date().toISOString()}`);
  say("");
  say(`scanned: ${jobs.length} Job rows, ${reqs.length} PilotRequirement rows`);
  say(`corrupted (will be rewritten): ${corrupted.length}`);
  say(`whitespace-convention only (REPORTED, left alone): ${whitespaceOnly.length}`);
  say("");

  if (corrupted.length === 0) {
    say("No corrupted rows. Nothing to repair.");
  } else {
    say("## Corrupted");
    for (const f of corrupted) {
      say(`- ${f.table} ${f.id}`);
      say(`    title:    ${JSON.stringify(f.title)}`);
      say(`    stored:   ${JSON.stringify(f.stored)}`);
      say(`    expected: ${JSON.stringify(f.expected)}`);
    }
    say("");
  }

  if (whitespaceOnly.length > 0) {
    say("## Whitespace convention only — NOT changed");
    for (const f of whitespaceOnly) {
      say(`- ${f.table} ${f.id} stored ${JSON.stringify(f.stored)} vs ${JSON.stringify(f.expected)}`);
    }
    say("");
  }

  if (APPLY && corrupted.length > 0) {
    say("## Applied");
    for (const f of corrupted) {
      if (f.table === "Job") {
        await prisma.job.update({ where: { id: f.id }, data: { normalizedTitle: f.expected } });
      } else {
        await prisma.pilotRequirement.update({ where: { id: f.id }, data: { normalizedTitle: f.expected } });
      }
      // The OLD value is recorded here and nowhere else. It is the only way back.
      say(`- ${f.table} ${f.id}: ${JSON.stringify(f.stored)} -> ${JSON.stringify(f.expected)}`);
    }
    say("");
    say("To undo, set each row's normalizedTitle back to the value on the left.");
  } else if (!APPLY && corrupted.length > 0) {
    say("Dry run. Re-run with --apply to write these.");
  }

  fs.writeFileSync(OUT, lines.join("\n") + "\n", "utf8");
  console.log(`\nreview file: ${OUT}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
