import "dotenv/config";
import { writeFileSync, readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../prisma/generated/client/client";
import { ONBOARDING_TASKS } from "../../lib/onboarding/tasks";

/**
 * Give existing hires the new "Send new hire contacts link" line.
 *
 * Adding a task to ONBOARDING_TASKS only affects hires created FROM NOW ON —
 * there is no backfill anywhere in the app, so everyone already in the system
 * would show a dash forever. Worse than cosmetic here: the hire detail page
 * renders the STORED rows, so the Send-contacts button hangs off a row that does
 * not exist, and the feature is unreachable for every one of the six people
 * currently onboarding.
 *
 * SIMPLER THAN scripts/bg-check-step/backfill.ts, and for one reason: this task
 * is LAST in ONBOARDING_TASKS, so nothing has to shift. Verified against the
 * live database before writing this — across all 216 hires that have a checklist,
 * onboarding rows occupy orders 0-19 and the maintenance rows 100-104, and order
 * 20 holds ZERO rows. The new task lands in a slot nobody is standing in.
 *
 *   npx tsx scripts/contacts-link-step/backfill.ts                        # dry run + review file
 *   npx tsx scripts/contacts-link-step/backfill.ts --apply --stage=ACTIVE # small batch first
 *   npx tsx scripts/contacts-link-step/backfill.ts --apply                # the rest
 *   npx tsx scripts/contacts-link-step/backfill.ts --undo                 # puts it all back
 *
 * --stage exists so the six people this actually matters for can be done and
 * eyeballed before 210 archived rows follow. UNDO.json ACCUMULATES across runs, so
 * a single --undo still reverses every batch.
 */

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const NEW_KEY = "contacts_link_sent";
const def = ONBOARDING_TASKS.find((t) => t.key === NEW_KEY);
if (!def) throw new Error(`${NEW_KEY} is not in ONBOARDING_TASKS — add it there first.`);
const NEW_ORDER = ONBOARDING_TASKS.findIndex((t) => t.key === NEW_KEY);
if (NEW_ORDER !== ONBOARDING_TASKS.length - 1) {
  throw new Error(
    `${NEW_KEY} is no longer last in ONBOARDING_TASKS (index ${NEW_ORDER} of ${ONBOARDING_TASKS.length}). ` +
      "This script assumes it is, and skips renumbering because of it. Shift the other rows first, " +
      "the way scripts/bg-check-step/backfill.ts does."
  );
}

const UNDO_PATH = "scripts/contacts-link-step/UNDO.json";
const PLAN_PATH = "scripts/contacts-link-step/PLAN.txt";

type Undo = { writtenAt: string; createdTaskIds: string[] };

/**
 * NA for anyone already finished, TODO for anyone still onboarding.
 *
 * Nobody gets DONE. Unlike the background-check step there is no other field that
 * implies this one happened — the link was only ever sent by hand, from Front, with
 * no record kept, so marking anyone DONE would be a guess presented as a fact. An
 * archived hire showing NA says "not applicable now", which is true; a TODO on 187
 * archived people would be 187 pieces of fake outstanding work.
 */
function statusFor(stage: string): string {
  return stage === "ARCHIVED" || stage === "POST_ONBOARD" ? "NA" : "TODO";
}

function readUndo(): Undo {
  try {
    return JSON.parse(readFileSync(UNDO_PATH, "utf8")) as Undo;
  } catch {
    return { writtenAt: new Date().toISOString(), createdTaskIds: [] };
  }
}

async function undo() {
  const saved = readUndo();
  const res = await prisma.onboardingTask.deleteMany({ where: { id: { in: saved.createdTaskIds } } });
  console.log(`Reverted ${saved.writtenAt}: removed ${res.count} of ${saved.createdTaskIds.length} tasks.`);
}

async function run(apply: boolean) {
  const hires = await prisma.newHire.findMany({
    select: { id: true, name: true, stage: true, tasks: { select: { id: true, key: true, order: true } } },
  });

  // Only people who actually HAVE a checklist. 241 of the 457 NewHire rows carry no
  // tasks at all — that is a different problem (rows imported without a checklist)
  // and must not be silently half-fixed here.
  const stageArg = process.argv.find((a) => a.startsWith("--stage="))?.split("=")[1];
  const targets = hires.filter(
    (h) =>
      h.tasks.length > 0 &&
      !h.tasks.some((t) => t.key === NEW_KEY) &&
      (!stageArg || h.stage === stageArg)
  );

  // The one assumption worth re-checking on every run rather than trusting the
  // comment above: is slot 20 actually free for each of these people?
  const collisions = targets.filter((h) => h.tasks.some((t) => t.order === NEW_ORDER));

  const lines: string[] = [];
  const tally: Record<string, number> = {};
  for (const h of targets) {
    const status = statusFor(h.stage);
    tally[`${h.stage}/${status}`] = (tally[`${h.stage}/${status}`] ?? 0) + 1;
    lines.push(`${h.name.padEnd(28)} ${h.stage.padEnd(13)} -> ${NEW_KEY} = ${status}`);
  }

  const header = [
    `BACKFILL "${def!.label}" (${NEW_KEY})`,
    "=".repeat(72),
    "",
    `NewHire rows: ${hires.length}`,
    `  with a checklist: ${hires.filter((h) => h.tasks.length > 0).length}`,
    `  already have ${NEW_KEY}: ${hires.filter((h) => h.tasks.some((t) => t.key === NEW_KEY)).length}`,
    `  TARGETS: ${targets.length}${stageArg ? ` (filtered to stage ${stageArg})` : ""}`,
    "",
    `new task order: ${NEW_ORDER} (last in ONBOARDING_TASKS, so nothing shifts)`,
    `hires already holding a row at order ${NEW_ORDER}: ${collisions.length}`,
    "",
    "status rule: NA for archived and post-onboard, so a brand-new task never",
    "appears as outstanding work on somebody who finished months ago. TODO for",
    "anyone still onboarding. Nobody is marked DONE — the link used to be sent by",
    "hand with no record, so DONE would be a guess dressed as a fact.",
    "",
    Object.entries(tally)
      .sort()
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n"),
    "",
    "-".repeat(72),
  ].join("\n");

  writeFileSync(PLAN_PATH, `${header}\n${lines.join("\n")}\n`, "utf8");
  console.log(header);
  console.log(`\nFull list -> ${PLAN_PATH}`);

  if (collisions.length > 0) {
    console.log(
      `\nSTOPPING: ${collisions.length} hires already have a task at order ${NEW_ORDER} ` +
        `(e.g. ${collisions[0]!.name}). Inserting would tie them and scramble the sequence. ` +
        "Renumber first."
    );
    return;
  }

  if (!apply) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply.");
    return;
  }

  // Carry forward what an earlier batch created, so --undo reverses all of them and
  // not merely the last run.
  const undoRecord: Undo = { writtenAt: new Date().toISOString(), createdTaskIds: readUndo().createdTaskIds };
  const carried = undoRecord.createdTaskIds.length;
  if (carried) console.log(`Carrying forward ${carried} task ids from an earlier batch.`);
  // Write the undo file BEFORE the first insert, so a crash mid-run still leaves a
  // file to append the ids into rather than an unrecorded partial write.
  writeFileSync(UNDO_PATH, JSON.stringify(undoRecord, null, 2), "utf8");

  for (const h of targets) {
    const task = await prisma.onboardingTask.create({
      data: {
        newHireId: h.id,
        key: NEW_KEY,
        label: def!.label,
        group: def!.group,
        order: NEW_ORDER,
        status: statusFor(h.stage),
      },
      select: { id: true },
    });
    undoRecord.createdTaskIds.push(task.id);
    // Flush every 25 so an interrupted run is still fully undoable.
    if (undoRecord.createdTaskIds.length % 25 === 0) {
      writeFileSync(UNDO_PATH, JSON.stringify(undoRecord, null, 2), "utf8");
    }
  }

  writeFileSync(UNDO_PATH, JSON.stringify(undoRecord, null, 2), "utf8");
  console.log(`\nAPPLIED: created ${undoRecord.createdTaskIds.length - carried} tasks (${undoRecord.createdTaskIds.length} undoable in total).`);
  console.log("Undo -> npx tsx scripts/contacts-link-step/backfill.ts --undo");
}

(async () => {
  try {
    if (process.argv.includes("--undo")) await undo();
    else await run(process.argv.includes("--apply"));
  } finally {
    await prisma.$disconnect();
  }
})();
