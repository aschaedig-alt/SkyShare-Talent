/**
 * Close the feedback reports that the Aug 28 travel work actually answered.
 *
 * WHY A SCRIPT AND NOT THE FEEDBACK PAGE. The page can do this, one row at a
 * time, with no record of what it changed. Four rows on the ONE shared live
 * database deserve the same treatment as any other live write here: a dry run
 * you can read first, an undo record written before anything moves, and a
 * verification pass that reads the rows back afterwards.
 *
 * WHAT IT TOUCHES. The `status` column on four Feedback rows, and nothing else.
 * No message, no images, no other row. Statuses are NEW | REVIEWING | DONE, the
 * same three the admin route validates (app/api/feedback/[id]/route.ts).
 *
 * WHAT IT DELIBERATELY LEAVES ALONE. The other five open reports. Three of them
 * are somebody else's work or nobody's yet (the /people double scrollbar, the
 * new-hire layout widgets, the interviewer-list question) and two sit in
 * REVIEWING from June and July. Closing a report this session did not answer
 * would be worse than leaving it open: it removes it from the list without
 * anybody having done the thing.
 *
 * USAGE
 *   npx tsx scripts/close-travel-feedback.ts            dry run — prints and writes nothing
 *   npx tsx scripts/close-travel-feedback.ts --apply    write, after recording the undo
 *   npx tsx scripts/close-travel-feedback.ts --undo     put every row back exactly as found
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
 * scripts/_*_output/ directory — .gitignore catches those, and the one file
 * that makes a live change reversible is the last thing that should be
 * untracked. See CLAUDE.md.
 *
 * BUILT FROM cwd, NOT __dirname, and that is not a style preference. Under tsx
 * this file's __dirname resolved to prisma/generated/client, so the first run
 * wrote the undo record to prisma/generated/client/travel-feedback-aug27/ —
 * which .gitignore:12 catches, making the record untracked in exactly the way
 * the rule above exists to prevent. The dry run prints this path so it can be
 * checked without writing anything.
 */
const UNDO_DIR = path.join(process.cwd(), "scripts", "travel-feedback-aug27");
const UNDO_FILE = path.join(UNDO_DIR, "UNDO.json");

/** Each report, and the ask inside it this session actually answered. */
const TARGETS: { id: string; who: string; why: string }[] = [
  {
    id: "cmtbw0hc6000004l5847qe8ns",
    who: "Hannah Byers, Aug 27, on a new hire's page",
    why: "All four asks shipped: the flight time now names Mountain (Utah) time and says arrives-vs-departs; Crew travel is a purpose; a trip clicked anywhere opens expanded; and not-needed field groups fold away."
  },
  {
    id: "cmtbw544s000304l547if3f22",
    who: "Hannah Byers, Aug 27, on /travel",
    why: "Two of three shipped — the name header links to the trip, and a trip that has passed folds itself away and expands on click. The third, dragging the little time boxes to change a trip's start and end, was DROPPED by the user rather than deferred."
  },
  {
    id: "cmtbw8wx3000504l5tyd7ppq0",
    who: "Hannah Byers, Aug 27, on /travel",
    why: "Both asks shipped: a traveler tab strip above the calendar, and archiving a tab once that person's travel has ended."
  },
  {
    id: "cmt33t2w5000004jps57t0zzq",
    who: "Hannah Byers, Aug 21, on /travel",
    why: "Fixed. A native date input fires change per keystroke, so typing a year wrote every intermediate value on the way past; that is the glitching through dates and landing on 1906. Writes now wait for a year in 2000-2100."
  }
];

const TARGET_STATUS = "DONE";

type UndoRecord = {
  writtenAt: string;
  note: string;
  rows: { id: string; status: string }[];
};

function line(char = "-") {
  console.log(char.repeat(78));
}

async function main() {
  const APPLY = process.argv.includes("--apply");
  const UNDO = process.argv.includes("--undo");

  if (APPLY && UNDO) {
    console.error("Pick one: --apply or --undo.");
    process.exit(1);
  }

  if (UNDO) return runUndo();

  // Read EVERY open row, not just the four, so the ones being left alone are
  // visible in the same output. A list of only what changes cannot show you
  // what it skipped.
  const all = await prisma.feedback.findMany({
    where: { status: { not: "DONE" } },
    orderBy: { createdAt: "asc" },
    select: { id: true, status: true, type: true, message: true, page: true, userName: true, createdAt: true }
  });

  const targetIds = new Set(TARGETS.map((t) => t.id));

  console.log(`Open feedback rows right now (status != DONE): ${all.length}`);
  line("=");
  for (const r of all) {
    const mark = targetIds.has(r.id) ? "CLOSING ->" : "leaving  ·";
    console.log(
      `${mark} [${r.createdAt.toISOString().slice(0, 10)}] ${r.status.padEnd(9)} ${r.type.padEnd(8)} ${r.userName ?? "?"}`
    );
    console.log(`             ${r.page ?? "-"}  ${r.message.replace(/\s+/g, " ").trim().slice(0, 96)}`);
    console.log(`             ${r.id}`);
  }
  line("=");

  // A target that is not in the open list is already DONE, or gone, or the id
  // is wrong — and all three look identical if you only count what matched.
  const found = new Set(all.filter((r) => targetIds.has(r.id)).map((r) => r.id));
  const missing = TARGETS.filter((t) => !found.has(t.id));
  if (missing.length) {
    console.log(`\nNOT FOUND among the open rows (${missing.length}) — already closed, or a wrong id:`);
    for (const m of missing) console.log(`  ${m.id}  (${m.who})`);
  }

  console.log(`\nWould set status = ${TARGET_STATUS} on ${found.size} row(s):`);
  for (const t of TARGETS) {
    if (!found.has(t.id)) continue;
    const row = all.find((r) => r.id === t.id)!;
    console.log(`\n  ${t.id}`);
    console.log(`    ${t.who}`);
    console.log(`    ${row.status} -> ${TARGET_STATUS}`);
    console.log(`    ${t.why}`);
  }

  if (!APPLY) {
    console.log(`\nUndo record would be written to: ${UNDO_FILE}`);
    console.log(`  (must be under scripts/, not a gitignored directory — see the note on UNDO_DIR)`);
    console.log(`\nDRY RUN — nothing was written. Re-run with --apply to make these changes.`);
    await prisma.$disconnect();
    return;
  }

  // The undo record is written BEFORE the first update, so a crash halfway
  // through still leaves something that can put the rows back.
  const undo: UndoRecord = {
    writtenAt: new Date().toISOString(),
    note: "Feedback.status before scripts/close-travel-feedback.ts --apply. Restore with --undo.",
    rows: all.filter((r) => targetIds.has(r.id)).map((r) => ({ id: r.id, status: r.status }))
  };
  if (!existsSync(UNDO_DIR)) mkdirSync(UNDO_DIR, { recursive: true });
  writeFileSync(UNDO_FILE, JSON.stringify(undo, null, 2));
  console.log(`\nUndo record written: ${UNDO_FILE}`);

  let changed = 0;
  for (const row of undo.rows) {
    await prisma.feedback.update({ where: { id: row.id }, data: { status: TARGET_STATUS } });
    changed += 1;
    console.log(`  ${row.id}  ${row.status} -> ${TARGET_STATUS}`);
  }

  await verify(TARGET_STATUS);
  console.log(`\nDone. ${changed} row(s) updated.`);
  await prisma.$disconnect();
}

async function runUndo() {
  if (!existsSync(UNDO_FILE)) {
    console.error(`No undo record at ${UNDO_FILE}. Nothing to reverse.`);
    process.exit(1);
  }
  const undo = JSON.parse(readFileSync(UNDO_FILE, "utf8")) as UndoRecord;
  console.log(`Restoring ${undo.rows.length} row(s) from ${undo.writtenAt}`);
  for (const row of undo.rows) {
    await prisma.feedback.update({ where: { id: row.id }, data: { status: row.status } });
    console.log(`  ${row.id}  -> ${row.status}`);
  }
  await prisma.$disconnect();
}

/** Read the rows back from the database rather than trusting the writes. */
async function verify(expected: string) {
  const rows = await prisma.feedback.findMany({
    where: { id: { in: TARGETS.map((t) => t.id) } },
    select: { id: true, status: true }
  });
  line();
  console.log("Read back from the database:");
  for (const r of rows) {
    console.log(`  ${r.id}  status=${r.status}  ${r.status === expected ? "OK" : "MISMATCH"}`);
  }
  const remaining = await prisma.feedback.count({ where: { status: { not: "DONE" } } });
  console.log(`Still open after this run: ${remaining}`);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
