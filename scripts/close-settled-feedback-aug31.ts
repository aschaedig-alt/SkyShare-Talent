/**
 * Close the three feedback reports that are genuinely settled as of Aug 31.
 *
 * WHY A SCRIPT AND NOT THE FEEDBACK PAGE. Same reasoning as
 * scripts/close-travel-feedback.ts, which this deliberately mirrors: the page
 * can do this one row at a time with no record of what changed. Writes to the
 * ONE shared live database get a dry run you can read first, an undo record
 * written before anything moves, and a read-back afterwards.
 *
 * WHAT IT TOUCHES. The `status` column on three Feedback rows and nothing else.
 * Statuses are NEW | REVIEWING | DONE, the three the admin route validates
 * (app/api/feedback/[id]/route.ts).
 *
 * WHY THESE THREE, each confirmed with the user on Aug 31:
 *
 *   cmsz0159w  "where does this list of interviewers come from?" (Aug 18)
 *              Answered AND shipped. The list is every app user (lib/data/team.ts);
 *              db5c274 then removed the app-account requirement outright.
 *
 *   cmthixqwj  Travel "not needed" / History "N/A" badges (Aug 31)
 *              Shipped. Travel reads the travel_complete task's NA state. History
 *              renders "none" rather than the literal "N/A" she asked for; the
 *              user reviewed it on screen and chose to keep "none" — his words,
 *              "I looked at it, no issues there. Leave that as none." So this is
 *              closed to a DECISION, not silently to a substitution.
 *
 *   cmr3rzz4l  "add an Email button... CPO, candidate and maybe supervisor" (Jul 2)
 *              Closed as STALE at the user's direction rather than as delivered,
 *              and the distinction matters to anyone reading this later. Only the
 *              candidate half was ever built (two checklist sends on the hire's
 *              page); supervisor, CPO and the role-aware recipient selection were
 *              never built. Two months on the user's words were "whatever we have
 *              is fine... I'm not looking to send any emails from July 2", plus a
 *              standing instruction to drop anything old and pending we are unsure
 *              about. Reopen it if the supervisor/CPO need ever comes back.
 *
 * WHAT IT DELIBERATELY LEAVES OPEN. The other three:
 *   cmthjmp2y  duplicate review — the banner and the dead Reopen buttons are
 *              being fixed right now; her complaint is still literally on screen.
 *   cmthlyx3z  orientation — the editable-body work is in progress.
 *   cmtg6yl0f  recruiting-jobs redesign — parked by the user pending mockups.
 * Closing a report whose fix has not landed is how a queue stops being trusted.
 *
 * USAGE
 *   npx tsx scripts/close-settled-feedback-aug31.ts            dry run — writes nothing
 *   npx tsx scripts/close-settled-feedback-aug31.ts --apply    write, after recording the undo
 *   npx tsx scripts/close-settled-feedback-aug31.ts --undo     put every row back exactly as found
 *
 * Both env files are loaded because .env holds only DATABASE_URL.
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { writeFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/client/client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

/**
 * The undo record lives beside the work it reverses, NOT under a
 * scripts/_*_output/ directory — .gitignore catches those, and the one file that
 * makes a live change reversible is the last thing that should be untracked.
 * Built from cwd for the same reason close-travel-feedback.ts does.
 */
const UNDO_DIR = path.join(process.cwd(), "scripts", "settled-feedback-aug31");
const UNDO_FILE = path.join(UNDO_DIR, "UNDO.json");

const TARGETS: { id: string; why: string }[] = [
  { id: "cmsz0159w000l04l2zv2mxnhn", why: "interviewer list — answered and shipped (db5c274)" },
  { id: "cmthixqwj000004l5sj8qfb66", why: "tab badges — shipped; 'none' kept by the user's decision" },
  { id: "cmr3rzz4l000004l55bsan7nf", why: "Jul 2 email button — closed as STALE at the user's direction" },
];

type UndoRow = { id: string; status: string };

async function main() {
  const apply = process.argv.includes("--apply");
  const undo = process.argv.includes("--undo");

  if (undo) {
    if (!existsSync(UNDO_FILE)) {
      console.error(`No undo record at ${UNDO_FILE}. Nothing to reverse.`);
      process.exit(1);
    }
    const rows: UndoRow[] = JSON.parse(readFileSync(UNDO_FILE, "utf8"));
    for (const r of rows) {
      await prisma.feedback.update({ where: { id: r.id }, data: { status: r.status } });
      console.log(`RESTORED ${r.id} -> ${r.status}`);
    }
    console.log(`\nReversed ${rows.length} rows.`);
    await prisma.$disconnect();
    return;
  }

  // Read the full open scope first, so what is being left behind is visible
  // rather than implied — the same positive-control habit CLAUDE.md requires.
  const open = await prisma.feedback.findMany({
    where: { NOT: { status: "DONE" } },
    select: { id: true, status: true, type: true, page: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Open (non-DONE) reports right now: ${open.length}`);
  for (const r of open) {
    const hit = TARGETS.find((t) => t.id === r.id);
    console.log(`  [${r.status.padEnd(9)}] ${r.id}  ${r.createdAt.toISOString().slice(0, 10)}  ${hit ? "CLOSING  — " + hit.why : "leaving open"}`);
  }

  const rows = await prisma.feedback.findMany({
    where: { id: { in: TARGETS.map((t) => t.id) } },
    select: { id: true, status: true, message: true },
  });

  if (rows.length !== TARGETS.length) {
    console.error(`\nExpected ${TARGETS.length} rows, found ${rows.length}. Refusing to write.`);
    await prisma.$disconnect();
    process.exit(1);
  }

  const alreadyDone = rows.filter((r) => r.status === "DONE");
  if (alreadyDone.length) {
    console.log(`\n${alreadyDone.length} already DONE; they will be skipped.`);
  }
  const toChange = rows.filter((r) => r.status !== "DONE");

  console.log(`\n${"=".repeat(80)}`);
  for (const r of toChange) {
    console.log(`${r.status} -> DONE   ${r.id}`);
    console.log(`   ${r.message.replace(/\s+/g, " ").trim().slice(0, 100)}`);
  }

  if (!apply) {
    console.log(`\nDRY RUN — nothing written. Re-run with --apply to write ${toChange.length} rows.`);
    await prisma.$disconnect();
    return;
  }

  if (!existsSync(UNDO_DIR)) mkdirSync(UNDO_DIR, { recursive: true });
  const undoRows: UndoRow[] = toChange.map((r) => ({ id: r.id, status: r.status }));
  writeFileSync(UNDO_FILE, JSON.stringify(undoRows, null, 2));
  console.log(`\nUndo record written BEFORE any change: ${UNDO_FILE}`);

  for (const r of toChange) {
    await prisma.feedback.update({ where: { id: r.id }, data: { status: "DONE" } });
    console.log(`WROTE ${r.id} -> DONE`);
  }

  // Read back rather than trusting the writes returned without throwing.
  const after = await prisma.feedback.findMany({
    where: { id: { in: TARGETS.map((t) => t.id) } },
    select: { id: true, status: true },
  });
  console.log(`\nRead back:`);
  for (const r of after) console.log(`  ${r.id}  ${r.status}`);

  const stillOpen = await prisma.feedback.count({ where: { NOT: { status: "DONE" } } });
  console.log(`\nOpen reports remaining: ${stillOpen}`);

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
