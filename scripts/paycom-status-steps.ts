/**
 * Paycom status steps that never happened (lib/paycom/status-steps.ts; the rule is the project
 * skill .claude/skills/paycom-status-steps/SKILL.md). Aimee's feedback cmwclez9e, 2026-11-11.
 *
 *   npx tsx scripts/paycom-status-steps.ts --plan [--out <review.md>] [--json <plan.json>]
 *       DRY RUN. Judges every step recorded from a Paycom invite and writes a review file:
 *       every step to remove with candidate, step, date and why, plus counts. Writes nothing.
 *   npx tsx scripts/paycom-status-steps.ts --apply <plan.json> [--limit N]
 *       removes the "remove" steps from that plan (re-checked at write time), writes an undo
 *       file under scripts/paycom-status-steps/undo/. --limit for a small first batch.
 *   npx tsx scripts/paycom-status-steps.ts --sweep [--apply]
 *       what the scheduled Paycom scan runs: plan + apply in one go. Dry run without --apply.
 *   npx tsx scripts/paycom-status-steps.ts --undo <undo file>
 *       puts those rows back exactly (same ids).
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fetchRecruitingCalendar, planStatusSteps, removeStatusSteps, restoreStatusSteps, type StepPlan } from "../lib/paycom/status-steps";
import { prisma } from "../lib/prisma";

const UNDO_DIR = path.join("scripts", "paycom-status-steps", "undo");
const RUN_BY = "aschaedig@skyshare.com";
const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
};

function review(plans: StepPlan[]): string {
  const remove = plans.filter((p) => p.verdict === "remove");
  const tally = (list: StepPlan[], key: (p: StepPlan) => string) => {
    const t: Record<string, number> = {};
    for (const p of list) t[key(p)] = (t[key(p)] ?? 0) + 1;
    return Object.entries(t).sort((a, b) => b[1] - a[1]);
  };
  const lines = [
    `# Paycom status steps — dry run ${new Date().toISOString()}`,
    "",
    `${plans.length} steps recorded from Paycom invites. ${remove.length} to REMOVE, ${plans.length - remove.length} to keep.`,
    "",
    "## Remove, by step",
    "| Step | Count |", "|---|---|",
    ...tally(remove, (p) => p.step).map(([k, n]) => `| ${k} | ${n} |`),
    "",
    "## Keep, by reason",
    "| Reason | Count |", "|---|---|",
    ...tally(plans.filter((p) => p.verdict === "keep"), (p) => p.why).map(([k, n]) => `| ${k} | ${n} |`),
    "",
    "## Every step to remove",
    "| Candidate | Step | Date (MT) | Status | Why | Interview id |", "|---|---|---|---|---|---|",
    ...remove.map((p) => `| ${p.candidate} | ${p.step} | ${p.date} | ${p.status} | ${p.why} | ${p.interviewId} |`),
    "",
    "## Every step kept",
    "| Candidate | Step | Date (MT) | Why | Evidence |", "|---|---|---|---|---|",
    ...plans.filter((p) => p.verdict === "keep").map((p) => `| ${p.candidate} | ${p.step} | ${p.date} | ${p.why} | ${(p.evidence ?? "").replace(/\|/g, "/")} |`)
  ];
  return lines.join("\n");
}

function writeUndo(rows: unknown[], label: string) {
  if (!existsSync(UNDO_DIR)) mkdirSync(UNDO_DIR, { recursive: true });
  const file = path.join(UNDO_DIR, `steps-${new Date().toISOString().replace(/[:.]/g, "-")}-${label}.json`);
  writeFileSync(file, JSON.stringify({ kind: "paycom-status-steps", rows }, null, 1));
  return file;
}

(async () => {
  try {
    if (process.argv.includes("--plan")) {
      const calendar = await fetchRecruitingCalendar();
      if (!calendar) console.error("Recruiting calendar could not be read: every step is kept this run.");
      const plans = await planStatusSteps({ calendar });
      const out = arg("--out") ?? path.join("scripts", "paycom-status-steps", "review.md");
      writeFileSync(out, review(plans));
      const json = arg("--json") ?? path.join("scripts", "paycom-status-steps", "plan.json");
      writeFileSync(json, JSON.stringify(plans, null, 1));
      console.log(JSON.stringify({ steps: plans.length, remove: plans.filter((p) => p.verdict === "remove").length, out, json }, null, 1));
      return;
    }
    const planFile = arg("--apply");
    if (planFile && !process.argv.includes("--sweep")) {
      const limit = arg("--limit") ? Number(arg("--limit")) : Infinity;
      const all = (JSON.parse(readFileSync(planFile, "utf8")) as StepPlan[]).filter((p) => p.verdict === "remove");
      // Skip ids an earlier batch already removed, so batches can be run one after another.
      const still = new Set((await prisma.interview.findMany({ where: { id: { in: all.map((p) => p.interviewId) } }, select: { id: true } })).map((r) => r.id));
      const batch = all.filter((p) => still.has(p.interviewId)).slice(0, limit);
      const rows = await removeStatusSteps(batch, { runBy: RUN_BY });
      const undo = writeUndo(rows, `batch-${rows.length}`);
      console.log(JSON.stringify({ asked: batch.length, removed: rows.length, undo }, null, 1));
      return;
    }
    if (process.argv.includes("--sweep")) {
      const calendar = await fetchRecruitingCalendar();
      if (!calendar) console.error("Recruiting calendar could not be read: every step is kept this run.");
      const plans = await planStatusSteps({ calendar });
      const remove = plans.filter((p) => p.verdict === "remove");
      if (!process.argv.includes("--apply")) {
        console.log(JSON.stringify({ dryRun: true, remove: remove.map((p) => `${p.candidate} | ${p.step} | ${p.date} | ${p.why}`) }, null, 1));
        return;
      }
      const rows = await removeStatusSteps(remove, { runBy: RUN_BY });
      const undo = rows.length ? writeUndo(rows, `sweep-${rows.length}`) : null;
      console.log(JSON.stringify({ removed: rows.length, steps: remove.map((p) => `${p.candidate} | ${p.step} | ${p.date}`), undo }, null, 1));
      return;
    }
    const undoFile = arg("--undo");
    if (undoFile) {
      const { rows } = JSON.parse(readFileSync(undoFile, "utf8")) as { rows: Array<Record<string, unknown> & { id: string }> };
      console.log(JSON.stringify({ restored: await restoreStatusSteps(rows), of: rows.length }, null, 1));
      return;
    }
    console.log("usage: --plan | --apply <plan.json> [--limit N] | --sweep [--apply] | --undo <file>");
  } finally {
    await prisma.$disconnect();
  }
})();
