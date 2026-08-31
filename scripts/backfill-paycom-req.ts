/**
 * Move a Paycom requisition NUMBER out of the Jazz-code column and into its own.
 *
 * WHY: Job carries two requisition columns on purpose — jobReqId holds the
 * Jazz-era codes (AMA.1, CJ2PIC.2) and paycomReqId holds Paycom's plain numbers
 * (3296). They are different schemes and will never match each other, so a Paycom
 * number filed under jobReqId is a key nothing can ever match against — which
 * matters because Paycom's "Offer Accepted" notice quotes that number and it is
 * one of only two exact keys we get.
 *
 * The IMPORTER bug that would have caused this at scale is fixed separately in
 * lib/imports/job-import.ts (splitRequisitionId). This script only cleans up rows
 * that already exist. Measured read-only against the live database on 2026-08-30,
 * that is exactly ONE row — 2619 on "Maintenance Technician" — and its source is
 * "Created in app", so it was typed into the wrong box on the new-job form rather
 * than imported.
 *
 * SAFETY: a numeric jobReqId is not proof of anything on its own — a Jazz code
 * could in principle be numeric too. So this does NOT move everything that looks
 * like a number. It moves only values in CONFIRMED below, each of which a human
 * has confirmed is a Paycom requisition. Anything else numeric is reported and
 * left alone.
 *
 *   npx tsx scripts/backfill-paycom-req.ts            # dry run, writes the review file
 *   npx tsx scripts/backfill-paycom-req.ts --apply    # writes, records the undo
 *   npx tsx scripts/backfill-paycom-req.ts --undo     # restores from that record
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/client/client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

/**
 * Requisition numbers a human has confirmed are Paycom's. Nothing outside this
 * set is touched, however numeric it looks.
 *
 *   2619 — confirmed by the user 2026-08-30 ("yes thats a paycom req").
 */
const CONFIRMED = new Set(["2619"]);

const OUT_DIR = path.join(process.cwd(), "scripts", "paycom-req-backfill");
const REVIEW_FILE = path.join(OUT_DIR, "review-paycom-req.txt");
const UNDO_FILE = path.join(OUT_DIR, "undo-paycom-req.json");

type UndoEntry = { jobId: string; title: string; jobReqIdWas: string | null; paycomReqIdWas: string | null };

function isNumericReq(value: string) {
  return /^\d{1,20}$/.test(value);
}

async function findCandidates() {
  const jobs = await prisma.job.findMany({
    where: { mergedIntoJobId: null, jobReqId: { not: null } },
    select: { id: true, title: true, status: true, source: true, jobReqId: true, paycomReqId: true },
    orderBy: { title: "asc" }
  });
  const numeric = jobs.filter((j) => isNumericReq((j.jobReqId ?? "").trim()));
  return {
    all: jobs,
    confirmed: numeric.filter((j) => CONFIRMED.has(j.jobReqId!.trim())),
    unconfirmed: numeric.filter((j) => !CONFIRMED.has(j.jobReqId!.trim()))
  };
}

async function dryRun() {
  const { all, confirmed, unconfirmed } = await findCandidates();
  const lines: string[] = [];
  const say = (s = "") => {
    lines.push(s);
    console.log(s);
  };

  say("Paycom requisition backfill — DRY RUN, nothing was written");
  say("=========================================================");
  say("");
  say(`Unmerged Job rows carrying a jobReqId: ${all.length}`);
  say(`  all-digits (look like Paycom numbers): ${all.filter((j) => isNumericReq((j.jobReqId ?? "").trim())).length}`);
  say(`  non-numeric (genuine Jazz codes):      ${all.filter((j) => !isNumericReq((j.jobReqId ?? "").trim())).length}`);
  say("");

  say(`WOULD MOVE (${confirmed.length}) — human-confirmed Paycom numbers`);
  if (!confirmed.length) say("  (none)");
  for (const j of confirmed) {
    say(`  job ${j.id}  "${j.title}"  [${j.status}, source ${j.source ?? "-"}]`);
    say(`    jobReqId    ${j.jobReqId}  ->  (null)`);
    say(`    paycomReqId ${j.paycomReqId ?? "(null)"}  ->  ${j.jobReqId}`);
  }
  say("");

  say(`WOULD LEAVE ALONE (${unconfirmed.length}) — numeric but not confirmed`);
  if (!unconfirmed.length) say("  (none)");
  for (const j of unconfirmed) {
    say(`  ${j.jobReqId}  "${j.title}"  [${j.status}] — add it to CONFIRMED only once a human has checked it`);
  }
  say("");

  // Positive control: an empty "would move" list should be readable as a real
  // result rather than as a query that silently matched nothing.
  say("POSITIVE CONTROL — first 10 non-numeric jobReqId values, untouched by design:");
  for (const j of all.filter((x) => !isNumericReq((x.jobReqId ?? "").trim())).slice(0, 10)) {
    say(`  ${j.jobReqId}  "${j.title}"`);
  }
  say("");
  const clash = confirmed.filter((j) => (j.paycomReqId ?? "").trim() && j.paycomReqId!.trim() !== j.jobReqId!.trim());
  say(`Rows where paycomReqId is already set to something DIFFERENT: ${clash.length}`);
  if (clash.length) {
    say("  REFUSING to overwrite these. Resolve by hand:");
    for (const j of clash) say(`    "${j.title}" jobReqId=${j.jobReqId} paycomReqId=${j.paycomReqId}`);
  }
  say("");
  say("Re-run with --apply to write these changes.");

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(REVIEW_FILE, lines.join("\n") + "\n", "utf8");
  console.log(`\nReview file written: ${path.relative(process.cwd(), REVIEW_FILE)}`);
  return { confirmed, clash };
}

async function apply() {
  const { confirmed, clash } = await dryRun();
  if (clash.length) {
    console.error("\nAborted: a row already has a different paycomReqId. Nothing was written.");
    process.exitCode = 1;
    return;
  }
  if (!confirmed.length) {
    console.log("\nNothing to apply.");
    return;
  }

  const undo: UndoEntry[] = [];
  for (const j of confirmed) {
    undo.push({ jobId: j.id, title: j.title, jobReqIdWas: j.jobReqId, paycomReqIdWas: j.paycomReqId });
    await prisma.job.update({
      where: { id: j.id },
      data: { jobReqId: null, paycomReqId: j.jobReqId!.trim() }
    });
    console.log(`applied: "${j.title}" jobReqId ${j.jobReqId} -> paycomReqId ${j.jobReqId}`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(UNDO_FILE, JSON.stringify(undo, null, 2) + "\n", "utf8");
  console.log(`\nUndo record written: ${path.relative(process.cwd(), UNDO_FILE)}`);

  // Read back, so the result is observed rather than assumed from the write call.
  console.log("\nRead back from the database:");
  for (const entry of undo) {
    const row = await prisma.job.findUnique({
      where: { id: entry.jobId },
      select: { title: true, jobReqId: true, paycomReqId: true }
    });
    console.log(`  "${row?.title}"  jobReqId=${row?.jobReqId ?? "(null)"}  paycomReqId=${row?.paycomReqId ?? "(null)"}`);
  }
}

async function undo() {
  if (!fs.existsSync(UNDO_FILE)) {
    console.error(`No undo record at ${path.relative(process.cwd(), UNDO_FILE)}`);
    process.exitCode = 1;
    return;
  }
  const entries = JSON.parse(fs.readFileSync(UNDO_FILE, "utf8")) as UndoEntry[];
  for (const entry of entries) {
    await prisma.job.update({
      where: { id: entry.jobId },
      data: { jobReqId: entry.jobReqIdWas, paycomReqId: entry.paycomReqIdWas }
    });
    console.log(`reverted: "${entry.title}" jobReqId=${entry.jobReqIdWas ?? "(null)"} paycomReqId=${entry.paycomReqIdWas ?? "(null)"}`);
  }
  console.log(`\nReverted ${entries.length} row(s).`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--undo")) return undo();
  if (args.includes("--apply")) return apply();
  await dryRun();
}

main().finally(() => prisma.$disconnect());
