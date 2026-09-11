/**
 * Catch up the people whose "Order business card" checklist item was ticked DONE
 * BEFORE the DONE -> QUEUED rule existed.
 *
 *   npx tsx scripts/business-card-queue-repair/repair.ts                 # dry run, writes review.md
 *   npx tsx scripts/business-card-queue-repair/repair.ts --all           # dry run, widened to former staff too
 *   npx tsx scripts/business-card-queue-repair/repair.ts --apply --limit 1   # smallest real batch first
 *   npx tsx scripts/business-card-queue-repair/repair.ts --apply             # the rest
 *   npx tsx scripts/business-card-queue-repair/repair.ts --undo              # put back exactly what was written
 *
 * WHY THERE IS ANYTHING TO REPAIR
 * lib/business-cards/checklist-sync.ts gained "task DONE -> card QUEUED" on
 * 2026-09-09. The sync only ever runs on a task PATCH, so it has never looked
 * backwards. Anybody ticked DONE before that date is still sitting at NEEDED:
 * the checklist says the step is finished and the Business cards page says the
 * card has not been dealt with, and both of them are showing the same person.
 *
 * WHAT IT DOES
 * businessCardStatus NEEDED -> QUEUED, for hires whose business_card task is
 * DONE. Exactly the transition the live sync would have made, and no other.
 * It never touches ORDERED, RECEIVED or NOT_NEEDED, never touches a task, and
 * never touches a hire whose task is not DONE.
 *
 * SCOPE. By default only current staff (employmentStatus ACTIVE, not canceled) —
 * the same scope the Business cards page itself reads, so the repair can only
 * affect rows somebody can actually see. --all widens it to former staff and
 * canceled offers; the dry run always REPORTS both so the choice is visible.
 *
 * SAFETY. The dry run writes review.md and touches nothing. --apply records every
 * row it changed in UNDO.json first, so --undo restores each person's exact prior
 * value. This is a shared live database: read the review file before applying, and
 * apply with --limit 1 first.
 */
import * as fs from "fs";
import * as path from "path";
import { prisma } from "@/lib/prisma";
import { BUSINESS_CARD_TASK_KEY } from "@/lib/business-cards/checklist-sync";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const REVIEW = path.join(HERE, "review.md");
const UNDO = path.join(HERE, "UNDO.json");

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const val = (f: string) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};
const APPLY = has("--apply");
const UNDO_MODE = has("--undo");
const ALL = has("--all");
const LIMIT = val("--limit") ? Number(val("--limit")) : null;

const FROM = "NEEDED";
const TO = "QUEUED";

type UndoRow = { id: string; name: string; from: string; to: string };

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

async function main() {
  if (UNDO_MODE) return undo();

  // Everybody who has a business_card task at all, with their card status. Wide
  // on purpose: the crosstab below is the positive control for the claim that
  // "task DONE + card NEEDED" is the only combination that needs repairing.
  const hires = await prisma.newHire.findMany({
    where: { tasks: { some: { key: BUSINESS_CARD_TASK_KEY } } },
    select: {
      id: true,
      name: true,
      employmentStatus: true,
      canceled: true,
      stage: true,
      orientationDate: true,
      businessCardStatus: true,
      tasks: { where: { key: BUSINESS_CARD_TASK_KEY }, select: { status: true, completedAt: true } }
    },
    orderBy: { name: "asc" }
  });

  const rows = hires.map((h) => ({
    id: h.id,
    name: h.name,
    employmentStatus: h.employmentStatus,
    canceled: h.canceled,
    stage: h.stage,
    orientationDate: h.orientationDate,
    card: h.businessCardStatus,
    task: h.tasks[0]?.status ?? "—",
    completedAt: h.tasks[0]?.completedAt ?? null
  }));

  // Positive control: the WHOLE distribution, not just the combination being
  // claimed. An empty result and a wrong query look identical without this.
  const crosstab = new Map<string, number>();
  for (const r of rows) {
    const k = `task ${r.task} + card ${r.card}`;
    crosstab.set(k, (crosstab.get(k) ?? 0) + 1);
  }

  const stranded = rows.filter((r) => r.task === "DONE" && r.card === FROM);
  const inScope = stranded.filter((r) => r.employmentStatus === "ACTIVE" && !r.canceled);
  const outOfScope = stranded.filter((r) => !(r.employmentStatus === "ACTIVE" && !r.canceled));
  const target = ALL ? stranded : inScope;
  const batch = LIMIT ? target.slice(0, LIMIT) : target;

  const table = (list: typeof stranded) =>
    list.length === 0
      ? "_none_\n"
      : [
          "| Name | Employment | Stage | Orientation | Task done on | Card status |",
          "| --- | --- | --- | --- | --- | --- |",
          ...list.map((r) => `| ${r.name} | ${r.employmentStatus}${r.canceled ? " (canceled)" : ""} | ${r.stage} | ${day(r.orientationDate)} | ${day(r.completedAt)} | ${r.card} |`)
        ].join("\n") + "\n";

  const review = [
    `# Business card queue repair — ${APPLY ? "APPLIED" : "DRY RUN"}`,
    "",
    `Generated ${new Date().toISOString()}`,
    "",
    `Change made to each person below: businessCardStatus **${FROM} -> ${TO}**. Nothing else is written.`,
    "",
    "## Positive control — every task/card combination that exists",
    "",
    `Hires with a ${BUSINESS_CARD_TASK_KEY} task: **${rows.length}**`,
    "",
    "| Combination | People |",
    "| --- | --- |",
    ...[...crosstab.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `| ${k} | ${n} |`),
    "",
    `## To repair — current staff (${inScope.length})`,
    "",
    "These are the ones the Business cards page can actually show. This is the default apply set.",
    "",
    table(inScope),
    `## Also stranded, but out of the page's scope (${outOfScope.length})`,
    "",
    "Former staff or canceled offers. Left alone unless you pass --all.",
    "",
    table(outOfScope),
    "## What would be written this run",
    "",
    `Scope: ${ALL ? "--all (current + former)" : "current staff only"}${LIMIT ? `, limited to ${LIMIT}` : ""}`,
    `Rows: **${batch.length}**`,
    "",
    APPLY ? "Applied. See UNDO.json to reverse." : "Nothing was written. Re-run with --apply once this list reads correctly.",
    ""
  ].join("\n");

  fs.writeFileSync(REVIEW, review, "utf8");
  console.log(review);
  console.log(`\nReview file: ${REVIEW}`);

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written.");
    return;
  }

  const undoRows: UndoRow[] = batch.map((r) => ({ id: r.id, name: r.name, from: r.card, to: TO }));
  fs.writeFileSync(UNDO, JSON.stringify({ writtenAt: new Date().toISOString(), rows: undoRows }, null, 2), "utf8");

  for (const r of batch) {
    // Re-read and re-check inside the loop: this database is shared and live, and
    // somebody may have moved this person since the list was built.
    const now = await prisma.newHire.findUnique({ where: { id: r.id }, select: { businessCardStatus: true } });
    if (now?.businessCardStatus !== FROM) {
      console.log(`SKIP ${r.name} — now ${now?.businessCardStatus ?? "missing"}, not ${FROM}`);
      continue;
    }
    await prisma.newHire.update({ where: { id: r.id }, data: { businessCardStatus: TO } });
    console.log(`OK   ${r.name}: ${FROM} -> ${TO}`);
  }
  console.log(`\nUndo record: ${UNDO}`);
}

async function undo() {
  if (!fs.existsSync(UNDO)) {
    console.log("No UNDO.json here — nothing to undo.");
    return;
  }
  const { rows } = JSON.parse(fs.readFileSync(UNDO, "utf8")) as { rows: UndoRow[] };
  for (const r of rows) {
    const now = await prisma.newHire.findUnique({ where: { id: r.id }, select: { businessCardStatus: true } });
    if (now?.businessCardStatus !== r.to) {
      console.log(`SKIP ${r.name} — now ${now?.businessCardStatus ?? "missing"}, not the ${r.to} this wrote`);
      continue;
    }
    await prisma.newHire.update({ where: { id: r.id }, data: { businessCardStatus: r.from } });
    console.log(`UNDO ${r.name}: ${r.to} -> ${r.from}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
