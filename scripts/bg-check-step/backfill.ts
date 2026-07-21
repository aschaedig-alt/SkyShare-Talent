import "dotenv/config";
import { writeFileSync, readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../prisma/generated/client/client";
import { ONBOARDING_TASKS } from "../../lib/onboarding/tasks";

/**
 * Give existing hires the new "Candidate submitted background check info" line.
 *
 * A background check is three steps and the checklist only modelled two, so the
 * middle one — the candidate actually filling in their details, which is what
 * Paycom's first email reports — had nowhere to live. Adding it to the task
 * config only affects hires created FROM NOW ON; everyone already in the system
 * would show a dash forever.
 *
 * Ordering matters here. The hire detail page sorts by the stored `order`, and
 * existing rows were numbered before this task existed — so bg_check_complete
 * already occupies the slot the new task needs. Inserting without renumbering
 * would tie the two and scramble a sequence whose whole point is being a
 * sequence. So every task at or after the new slot is shifted down by one.
 *
 *   npx tsx scripts/bg-check-step/backfill.ts          # dry run + review file
 *   npx tsx scripts/bg-check-step/backfill.ts --apply  # writes, saves UNDO.json
 *   npx tsx scripts/bg-check-step/backfill.ts --undo   # puts it all back
 */

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const NEW_KEY = "bg_check_info";
const def = ONBOARDING_TASKS.find((t) => t.key === NEW_KEY);
if (!def) throw new Error(`${NEW_KEY} is not in ONBOARDING_TASKS — add it there first.`);
const NEW_ORDER = ONBOARDING_TASKS.findIndex((t) => t.key === NEW_KEY);

const UNDO_PATH = "scripts/bg-check-step/UNDO.json";
const PLAN_PATH = "scripts/bg-check-step/PLAN.txt";

type Undo = { writtenAt: string; createdTaskIds: string[]; shifted: Array<{ id: string; order: number }> };

/**
 * What status should the new step carry for someone already part-way through?
 * If their check already CAME BACK, they self-evidently submitted their info, so
 * backdating it to DONE is a statement of fact rather than a guess. People long
 * since finished get NA so a brand-new task never appears as outstanding work on
 * someone who completed onboarding months ago.
 */
function statusFor(tasks: Array<{ key: string; status: string }>, stage: string): string {
  const status = (key: string) => tasks.find((t) => t.key === key)?.status;
  if (status("bg_check_complete") === "DONE") return "DONE";
  if (stage === "ARCHIVED" || stage === "POST_ONBOARD") return "NA";
  return "TODO";
}

async function undo() {
  const saved = JSON.parse(readFileSync(UNDO_PATH, "utf8")) as Undo;
  await prisma.onboardingTask.deleteMany({ where: { id: { in: saved.createdTaskIds } } });
  for (const s of saved.shifted) {
    await prisma.onboardingTask.update({ where: { id: s.id }, data: { order: s.order } });
  }
  console.log(`Reverted ${saved.writtenAt}: removed ${saved.createdTaskIds.length} tasks, restored ${saved.shifted.length} orders.`);
}

async function run(apply: boolean) {
  const hires = await prisma.newHire.findMany({
    select: { id: true, name: true, stage: true, tasks: { select: { id: true, key: true, status: true, order: true } } }
  });

  // Only people who actually HAVE a checklist. A hire with no tasks at all is a
  // different problem (seed drift) and must not be silently half-fixed here.
  const targets = hires.filter(
    (h) => h.tasks.some((t) => t.key === "bg_check_start") && !h.tasks.some((t) => t.key === NEW_KEY)
  );

  const lines: string[] = [];
  const tally: Record<string, number> = {};
  for (const h of targets) {
    const status = statusFor(h.tasks, h.stage);
    tally[`${h.stage}/${status}`] = (tally[`${h.stage}/${status}`] ?? 0) + 1;
    lines.push(`${h.name.padEnd(28)} ${h.stage.padEnd(13)} -> ${NEW_KEY} = ${status}`);
  }

  const header = [
    `BACKFILL "${def!.label}" (${NEW_KEY})`,
    "=".repeat(72),
    "",
    `hires with a checklist and no ${NEW_KEY}: ${targets.length}`,
    `new task slot (order): ${NEW_ORDER} — tasks at or after it shift down by one`,
    "",
    "status rule: DONE if their check already came back; NA for archived and",
    "post-onboard (never show new outstanding work on someone already finished);",
    "TODO for anyone still onboarding.",
    "",
    Object.entries(tally)
      .sort()
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n"),
    "",
    "-".repeat(72)
  ].join("\n");

  writeFileSync(PLAN_PATH, `${header}\n${lines.join("\n")}\n`, "utf8");
  console.log(header);
  console.log(`\nFull list -> ${PLAN_PATH}`);

  if (!apply) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply.");
    return;
  }

  const undoRecord: Undo = { writtenAt: new Date().toISOString(), createdTaskIds: [], shifted: [] };

  for (const h of targets) {
    // Record the old orders BEFORE shifting, so undo is exact.
    const toShift = h.tasks.filter((t) => t.order >= NEW_ORDER);
    for (const t of toShift) undoRecord.shifted.push({ id: t.id, order: t.order });
  }
  writeFileSync(UNDO_PATH, JSON.stringify(undoRecord, null, 2), "utf8");

  let created = 0;
  for (const h of targets) {
    for (const t of h.tasks.filter((t) => t.order >= NEW_ORDER)) {
      await prisma.onboardingTask.update({ where: { id: t.id }, data: { order: t.order + 1 } });
    }
    const task = await prisma.onboardingTask.create({
      data: {
        newHireId: h.id,
        key: NEW_KEY,
        label: def!.label,
        group: def!.group,
        order: NEW_ORDER,
        status: statusFor(h.tasks, h.stage)
      },
      select: { id: true }
    });
    undoRecord.createdTaskIds.push(task.id);
    created += 1;
  }

  writeFileSync(UNDO_PATH, JSON.stringify(undoRecord, null, 2), "utf8");
  console.log(`\nAPPLIED: created ${created} tasks, shifted ${undoRecord.shifted.length} orders.`);
  console.log(`Undo -> npx tsx scripts/bg-check-step/backfill.ts --undo`);
}

(async () => {
  try {
    if (process.argv.includes("--undo")) await undo();
    else await run(process.argv.includes("--apply"));
  } finally {
    await prisma.$disconnect();
  }
})();
