/**
 * Backfill: make every candidate with a linked employee record read the way the
 * new hire-lifecycle sync would leave them (Aimee feedback cmwclwrfp + cmwclxn4v,
 * 2026-11-11). Uses the SAME planner as the live hooks
 * (lib/candidates/hire-lifecycle.ts), so the backfill and the automatic path can
 * never disagree about what "hired" means.
 *
 *   npx tsx scripts/hired-status-backfill.ts                 dry run, writes review.md
 *   npx tsx scripts/hired-status-backfill.ts --apply --limit 5   first small batch
 *   npx tsx scripts/hired-status-backfill.ts --apply             the rest
 *   npx tsx scripts/hired-status-backfill.ts --undo              put every row back
 *
 * Every applied row is appended to UNDO.json BEFORE it is written (the prior
 * status, stage, skip-list fields, application stage/status, and the id of the
 * timeline event it created), so --undo restores the exact prior values and
 * deletes the timeline entries it added. Undo refuses a row that has changed
 * since, rather than overwrite somebody's later edit.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
// One client, shared with the planner (lib/prisma loads .env itself; DATABASE_URL
// lives there).
import { prisma } from "../lib/prisma";
import { planCandidateSync, planHasChanges, type CandidateSyncPlan } from "../lib/candidates/hire-lifecycle";

const APPLY = process.argv.includes("--apply");
const UNDO = process.argv.includes("--undo");
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;
const OUT_DIR = join(process.cwd(), "scripts", "hired-status-backfill");
const UNDO_FILE = join(OUT_DIR, "UNDO.json");
const REVIEW_FILE = join(OUT_DIR, "review.md");
const REASON = "Backfilled 2026-11 when the Current employee and Former employee statuses were added.";

type UndoRow = {
  candidateId: string;
  displayName: string;
  after: { status: string | null; stage: string | null };
  before: CandidateSyncPlan["before"];
  application: CandidateSyncPlan["application"];
  timelineEventId: string | null;
  appliedAt: string;
};

function readUndo(): UndoRow[] {
  return existsSync(UNDO_FILE) ? (JSON.parse(readFileSync(UNDO_FILE, "utf8")) as UndoRow[]) : [];
}

async function undo() {
  const rows = readUndo();
  let restored = 0;
  const refused: string[] = [];
  for (const row of rows.reverse()) {
    const now = await prisma.candidate.findUnique({ where: { id: row.candidateId }, select: { status: true, stage: true } });
    if (!now) continue;
    if (now.status !== row.after.status || now.stage !== row.after.stage) {
      refused.push(`${row.displayName} (${row.candidateId}): now ${now.status}/${now.stage}, expected ${row.after.status}/${row.after.stage}`);
      continue;
    }
    await prisma.$transaction(async (tx) => {
      await tx.candidate.update({
        where: { id: row.candidateId },
        data: {
          status: row.before.status,
          stage: row.before.stage,
          scanExcludedReason: row.before.scanExcludedReason,
          scanExcludedNote: row.before.scanExcludedNote,
          scanExcludedAt: row.before.scanExcludedAt ? new Date(row.before.scanExcludedAt) : null,
          scanExcludedBy: row.before.scanExcludedBy
        }
      });
      if (row.application) {
        await tx.candidateApplication.update({
          where: { id: row.application.id },
          data: { stage: row.application.before.stage, status: row.application.before.status }
        });
      }
      if (row.timelineEventId) await tx.timelineEvent.deleteMany({ where: { id: row.timelineEventId } });
    });
    restored++;
  }
  writeFileSync(UNDO_FILE + `.undone-${Date.now()}.json`, JSON.stringify(rows, null, 2));
  writeFileSync(UNDO_FILE, "[]");
  console.log(`Restored ${restored}. Refused ${refused.length}.`);
  for (const r of refused) console.log("  refused:", r);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  if (UNDO) return undo();

  const linked = await prisma.newHire.findMany({
    where: { candidateId: { not: null } },
    select: { candidateId: true },
    distinct: ["candidateId"]
  });
  const plans: CandidateSyncPlan[] = [];
  let noChange = 0;
  const reappliedOnly: CandidateSyncPlan[] = [];
  let skipped = 0;
  for (const { candidateId } of linked) {
    const plan = await planCandidateSync(candidateId!);
    if (!plan) skipped++;
    else if (planHasChanges(plan)) plans.push(plan);
    else {
      noChange++;
      if (plan.reapplied) reappliedOnly.push(plan);
    }
  }

  // ---- review file ----
  const by = (s: string) => plans.filter((p) => p.state === s);
  const tally = (list: CandidateSyncPlan[], f: (p: CandidateSyncPlan) => string) => {
    const m = new Map<string, number>();
    for (const p of list) m.set(f(p), (m.get(f(p)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `  - ${k}: ${n}`).join("\n");
  };
  const line = (p: CandidateSyncPlan) =>
    `- ${p.displayName} (${p.candidateId}) — ${p.timeline.title}. ${p.timeline.detail}${p.applicationSkipped ? ` [application not moved: ${p.applicationSkipped}]` : ""}`;
  const md = [
    `# Hired / Former employee backfill — ${APPLY ? "APPLY" : "DRY RUN"} ${new Date().toISOString()}`,
    "",
    `Candidates with a linked employee record: ${linked.length}`,
    `- would change: ${plans.length}`,
    `- already right: ${noChange}`,
    `- skipped (merged tombstone / no hire): ${skipped}`,
    "",
    `## Employed → Current employee (${by("EMPLOYED").length})`,
    "Status transitions:",
    tally(by("EMPLOYED"), (p) => `${p.before.status} → ${p.candidate.status ?? p.before.status}`),
    "Stage transitions:",
    tally(by("EMPLOYED"), (p) => `${p.before.stage ?? "none"} → ${p.candidate.stage ?? p.before.stage ?? "none"}`),
    `Newly held out of scans: ${by("EMPLOYED").filter((p) => p.candidate.scanExcludedReason).length}`,
    `Application moved to Hired: ${by("EMPLOYED").filter((p) => p.application).length}`,
    `Application left alone (ambiguous): ${by("EMPLOYED").filter((p) => p.applicationSkipped).length}`,
    "",
    `## Terminated → Former employee (${by("TERMINATED").length})`,
    "Status transitions:",
    tally(by("TERMINATED"), (p) => `${p.before.status} → ${p.candidate.status ?? p.before.status}`),
    "Stage transitions:",
    tally(by("TERMINATED"), (p) => `${p.before.stage ?? "none"} → ${p.candidate.stage ?? p.before.stage ?? "none"}`),
    "",
    `## Applied again after the hire or after leaving — for a look; an employee keeps the stage they are at, a leaver is left alone entirely (${plans.filter((p) => p.reapplied).length + reappliedOnly.length})`,
    ...[...plans.filter((p) => p.reapplied), ...reappliedOnly].map(
      (p) => `- ${p.displayName} (${p.candidateId}) — ${p.state}, stage ${p.before.stage ?? "none"}, applied ${p.reapplied!.appliedAt.slice(0, 10)}${p.reapplied!.job ? ` for ${p.reapplied!.job}` : ""}${p.state === "TERMINATED" ? " — left entirely alone" : ""}`
    ),
    "",
    `## Canceled hire (${by("CANCELED").length})`,
    tally(by("CANCELED"), (p) => `${p.before.status} → ${p.candidate.status ?? p.before.status}`),
    "",
    "## Every row",
    ...plans.map(line)
  ].join("\n");
  writeFileSync(REVIEW_FILE, md);
  console.log(md.split("## Every row")[0]);
  console.log(`Review file: ${REVIEW_FILE}`);

  if (!APPLY) return;

  const undoRows = readUndo();
  let applied = 0;
  for (const plan of plans) {
    if (applied >= LIMIT) break;
    const row: UndoRow = {
      candidateId: plan.candidateId,
      displayName: plan.displayName,
      after: { status: plan.candidate.status ?? plan.before.status, stage: plan.candidate.stage ?? plan.before.stage },
      before: plan.before,
      application: plan.application,
      timelineEventId: null,
      appliedAt: new Date().toISOString()
    };
    // Written to the undo file BEFORE the change, so a crash mid-row is still undoable.
    undoRows.push(row);
    writeFileSync(UNDO_FILE, JSON.stringify(undoRows, null, 2));
    const ev = await prisma.$transaction(async (tx) => {
      if (Object.keys(plan.candidate).length > 0) {
        await tx.candidate.update({ where: { id: plan.candidateId }, data: plan.candidate });
      }
      if (plan.application) {
        await tx.candidateApplication.update({
          where: { id: plan.application.id },
          data: { stage: plan.application.after.stage, status: plan.application.after.status }
        });
      }
      return tx.timelineEvent.create({
        data: {
          candidateId: plan.candidateId,
          type: plan.timeline.type,
          title: plan.timeline.title,
          detail: `${plan.timeline.detail} Why: ${REASON}`,
          occurredAt: plan.timeline.occurredAt,
          origin: "MANUAL",
          sourceType: "NewHire",
          sourceId: plan.hireId
        },
        select: { id: true }
      });
    });
    row.timelineEventId = ev.id;
    writeFileSync(UNDO_FILE, JSON.stringify(undoRows, null, 2));
    applied++;
    console.log(`applied: ${plan.displayName} — ${plan.timeline.detail}`);
  }
  console.log(`Applied ${applied} of ${plans.length}. Undo file: ${UNDO_FILE}`);
}

main().finally(() => prisma.$disconnect());
