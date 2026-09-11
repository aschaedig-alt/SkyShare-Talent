/**
 * One-time backfill: add the "supervisor_contact_sent" checklist step to hires
 * who already exist.
 *
 * A new checklist key only lands on hires created AFTER it exists, so without
 * this the step is real, wired to a Front template, and reachable by nobody.
 * Asked for on 2026-09-11: "add the one-time backfill of the supervisor contact
 * to my current active checklists."
 *
 * MODELLED ON scripts/contacts-link-step/backfill.ts, with one deliberate change.
 * That script derived the row's `order` from ONBOARDING_TASKS.findIndex and
 * asserted the key was last. That was true in July. Since then saveChecklistArrangement
 * re-stamps every hire's order from the SAVED LAYOUT, so the code index is no
 * longer the live order — it would file the step in the wrong place. This reads
 * the placement from getChecklistPlacement(), which is the same source a freshly
 * created hire uses, so a backfilled row and a new one land identically.
 *
 * STATUS RULE, unchanged from the precedent and worth keeping: TODO for a hire
 * still onboarding, NA for one who is finished or archived, and nobody is marked
 * DONE. Marking it done would be a guess dressed as a fact — nobody has sent
 * these people's details to their supervisor.
 *
 *   npx tsx scripts/supervisor-contact-step/backfill.ts                 dry run
 *   npx tsx scripts/supervisor-contact-step/backfill.ts --apply         ACTIVE only
 *   npx tsx scripts/supervisor-contact-step/backfill.ts --apply --all   every stage
 *   npx tsx scripts/supervisor-contact-step/backfill.ts --undo          remove them again
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../prisma/generated/client/client";
import { getChecklistPlacement } from "../../lib/data/onboarding-grid-config";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const KEY = "supervisor_contact_sent";
const HERE = join(process.cwd(), "scripts", "supervisor-contact-step");
const UNDO = join(HERE, "UNDO.json");
const PLAN = join(HERE, "PLAN.txt");

async function main() {
  if (!existsSync(HERE)) mkdirSync(HERE, { recursive: true });
  const apply = process.argv.includes("--apply");
  const all = process.argv.includes("--all");
  const undo = process.argv.includes("--undo");

  if (undo) {
    if (!existsSync(UNDO)) throw new Error("No UNDO.json — nothing was applied from here.");
    const ids = JSON.parse(readFileSync(UNDO, "utf8")) as string[];
    const res = await prisma.onboardingTask.deleteMany({ where: { id: { in: ids } } });
    console.log(`Removed ${res.count} of the ${ids.length} rows this script created.`);
    await prisma.$disconnect();
    return;
  }

  const placement = (await getChecklistPlacement()).get(KEY);
  if (!placement) {
    throw new Error(
      `${KEY} is not in the checklist layout, so there is nowhere to put it. ` +
        "Check lib/onboarding/tasks.ts before running this."
    );
  }
  console.log(`Placement from the SAVED layout: group=${placement.group} order=${placement.order} label="${placement.label}"`);

  // Every hire, so the dry run can show the whole scope rather than a filtered slice.
  const hires = await prisma.newHire.findMany({
    select: {
      id: true,
      name: true,
      stage: true,
      canceled: true,
      tasks: { select: { key: true, order: true } }
    },
    orderBy: [{ stage: "asc" }, { name: "asc" }]
  });

  const lines: string[] = [];
  const toCreate: Array<{ newHireId: string; name: string; status: "TODO" | "NA"; collision: string | null }> = [];
  let already = 0;
  let noChecklist = 0;
  const skippedByStage: string[] = [];

  for (const h of hires) {
    if (h.tasks.some((t) => t.key === KEY)) { already++; continue; }
    // A hire with no checklist at all is not missing this step — they have no
    // checklist. Creating one row would give them a checklist of exactly one item.
    if (h.tasks.length === 0) { noChecklist++; continue; }

    const inScope = all ? true : h.stage === "ACTIVE" && !h.canceled;
    if (!inScope) { skippedByStage.push(`${h.name} (${h.stage}${h.canceled ? ", canceled" : ""})`); continue; }

    // NOBODY IS MARKED DONE. Nobody has sent these.
    const status: "TODO" | "NA" = h.stage === "ACTIVE" && !h.canceled ? "TODO" : "NA";
    // A different key already sitting on the target order is not fatal — the list
    // sorts by order and ties fall back to insertion — but it is worth seeing.
    const clash = h.tasks.find((t) => t.order === placement.order);
    toCreate.push({
      newHireId: h.id,
      name: h.name,
      status,
      collision: clash ? `order ${placement.order} already used by ${clash.key}` : null
    });
  }

  const byStage: Record<string, number> = {};
  for (const h of hires) byStage[h.stage] = (byStage[h.stage] ?? 0) + 1;

  lines.push(`Hires in the database: ${hires.length}  (${Object.entries(byStage).map(([s, n]) => `${s}=${n}`).join(", ")})`);
  lines.push(`Already have the step: ${already}`);
  lines.push(`No checklist at all (skipped): ${noChecklist}`);
  lines.push(`Out of scope this run: ${skippedByStage.length}${all ? " (--all, so none)" : " (not ACTIVE)"}`);
  lines.push("");
  lines.push(`WOULD CREATE ${toCreate.length} rows, group=${placement.group} order=${placement.order}:`);
  for (const c of toCreate) lines.push(`  ${c.status.padEnd(5)} ${c.name}${c.collision ? `   [${c.collision}]` : ""}`);
  if (!all && skippedByStage.length) {
    lines.push("");
    lines.push(`Not touched (re-run with --all to include them): ${skippedByStage.length}`);
    for (const s of skippedByStage.slice(0, 12)) lines.push(`  ${s}`);
    if (skippedByStage.length > 12) lines.push(`  ... and ${skippedByStage.length - 12} more`);
  }

  const text = lines.join("\n");
  writeFileSync(PLAN, text + "\n");
  console.log("\n" + text);
  console.log(`\nPlan written to ${PLAN}`);

  if (!apply) {
    console.log("\nDry run. Nothing written. Re-run with --apply.");
    await prisma.$disconnect();
    return;
  }
  if (toCreate.length === 0) {
    console.log("\nNothing to create.");
    await prisma.$disconnect();
    return;
  }

  const created: string[] = [];
  for (const c of toCreate) {
    const row = await prisma.onboardingTask.create({
      data: {
        newHireId: c.newHireId,
        key: KEY,
        label: placement.label,
        group: placement.group,
        order: placement.order,
        status: c.status
      },
      select: { id: true }
    });
    created.push(row.id);
  }
  // Accumulates across runs, so an --apply of ACTIVE followed by an --all can
  // both be undone.
  const prior: string[] = existsSync(UNDO) ? (JSON.parse(readFileSync(UNDO, "utf8")) as string[]) : [];
  writeFileSync(UNDO, JSON.stringify([...prior, ...created], null, 2));
  console.log(`\nCreated ${created.length} rows. Undo record: ${UNDO} (--undo removes exactly these).`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
