/**
 * Put Paycom's "Not Selected - Past Interview" back on the applications where it was
 * folded into "Failed Interview" (Aimee's feedback cmwcqsevi, 2026-11-11).
 *
 *   npx tsx scripts/paycom-past-interview.ts --plan
 *       DRY RUN. Reads the Paycom Hiring Metrics exports (the source of these rows) and
 *       lists every application whose disposition says "Failed Interview" but whose
 *       Paycom wording was "Not Selected - Past Interview". Writes a review file.
 *   npx tsx scripts/paycom-past-interview.ts --apply [--limit N]
 *       rewords those (only rows still saying "Failed Interview"); undo file written.
 *   npx tsx scripts/paycom-past-interview.ts --undo <file>
 *       puts "Failed Interview" back on exactly those ids.
 *
 * WHY THE EXPORT. The Sep 7 vocabulary rewrite merged wordings with no per-row record of
 * the original, so the only place that still says which "Failed Interview" was really
 * "Past Interview" is Paycom's own export, keyed by Application ID (sourceApplicationId).
 * Rows with no Paycom id (JazzHR) or not in the export are left alone and counted.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../lib/prisma";
import { loadRows, str } from "../lib/paycom/hiring-metrics";
import { legacyKey, toHouseWording } from "../lib/candidates/disposition-vocabulary";

const OLD = "Failed Interview";
const NEW = "Not Selected - Past Interview";
const EXPORTS = ["Sheet10", "Sheet14"].map((s) => `C:/Users/Recruiter/Downloads/Hiring Metrics - ${s}.csv`);
const OUT = path.join("scripts", "paycom-status-steps");
const arg = (f: string) => {
  const i = process.argv.indexOf(f);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
};

type Item = { id: string; paycomId: string; candidate: string; candidateId: string; job: string; decided: string | null };

async function plan() {
  // Guard: the vocabulary must already say the new thing, or a future import would undo this.
  if (toHouseWording("Not Selected - Past Interview") !== NEW) throw new Error("disposition-vocabulary.ts still folds Past Interview into Failed Interview");
  const orig = new Map<string, Set<string>>();
  for (const f of EXPORTS) {
    for (const r of loadRows(f)) {
      const id = str(r["Application ID"]).trim();
      const d = str(r["Disposition"]).trim();
      if (id && d) orig.set(id, new Set([...(orig.get(id) ?? []), legacyKey(d)]));
    }
  }
  const apps = await prisma.candidateApplication.findMany({
    where: { disposition: OLD },
    select: { id: true, sourceApplicationId: true, decidedAt: true, origin: true, candidateId: true, candidate: { select: { displayName: true } }, job: { select: { title: true } }, historicalJobTitle: true }
  });
  const fix: Item[] = [];
  const tally: Record<string, number> = {};
  for (const a of apps) {
    const o = a.sourceApplicationId ? orig.get(a.sourceApplicationId) : undefined;
    const why = !a.sourceApplicationId ? `no Paycom id (${a.origin})` : !o ? "not in the export" : o.has("notselectedpastinterview") && o.size === 1 ? "past interview" : [...o].join("+");
    tally[why] = (tally[why] ?? 0) + 1;
    if (why === "past interview") {
      fix.push({ id: a.id, paycomId: a.sourceApplicationId!, candidate: a.candidate.displayName, candidateId: a.candidateId, job: a.job?.title ?? a.historicalJobTitle ?? "", decided: a.decidedAt?.toISOString().slice(0, 10) ?? null });
    }
  }
  fix.sort((a, b) => a.candidate.localeCompare(b.candidate));
  return { fix, tally, total: apps.length };
}

(async () => {
  try {
    if (process.argv.includes("--plan")) {
      const { fix, tally, total } = await plan();
      const md = [
        `# "Failed Interview" that Paycom calls "Not Selected - Past Interview" — dry run ${new Date().toISOString()}`, "",
        `${total} applications say "${OLD}". Paycom's own wording, by application id: ${Object.entries(tally).map(([k, n]) => `${n} ${k}`).join(", ")}.`, "",
        `## To reword to "${NEW}": ${fix.length}`, "",
        "| Candidate | Job | Paycom application | Dispositioned |", "|---|---|---|---|",
        ...fix.map((f) => `| ${f.candidate} | ${f.job} | ${f.paycomId} | ${f.decided ?? ""} |`)
      ].join("\n");
      writeFileSync(path.join(OUT, "past-interview-review.md"), md);
      writeFileSync(path.join(OUT, "past-interview-plan.json"), JSON.stringify(fix, null, 1));
      console.log(JSON.stringify({ total, tally, fix: fix.length, review: path.join(OUT, "past-interview-review.md") }, null, 1));
      return;
    }
    if (process.argv.includes("--apply")) {
      const limit = arg("--limit") ? Number(arg("--limit")) : Infinity;
      const all = JSON.parse(readFileSync(path.join(OUT, "past-interview-plan.json"), "utf8")) as Item[];
      const still = await prisma.candidateApplication.findMany({ where: { id: { in: all.map((f) => f.id) }, disposition: OLD }, select: { id: true } });
      const ids = all.filter((f) => still.some((s) => s.id === f.id)).slice(0, limit).map((f) => f.id);
      const undoDir = path.join(OUT, "undo");
      if (!existsSync(undoDir)) mkdirSync(undoDir, { recursive: true });
      const undo = path.join(undoDir, `past-interview-${new Date().toISOString().replace(/[:.]/g, "-")}-${ids.length}.json`);
      writeFileSync(undo, JSON.stringify({ kind: "paycom-past-interview", from: OLD, to: NEW, ids }, null, 1));
      const r = await prisma.candidateApplication.updateMany({ where: { id: { in: ids }, disposition: OLD }, data: { disposition: NEW } });
      console.log(JSON.stringify({ asked: ids.length, updated: r.count, undo }, null, 1));
      return;
    }
    const undoFile = arg("--undo");
    if (undoFile) {
      const { ids } = JSON.parse(readFileSync(undoFile, "utf8")) as { ids: string[] };
      const r = await prisma.candidateApplication.updateMany({ where: { id: { in: ids }, disposition: NEW }, data: { disposition: OLD } });
      console.log(JSON.stringify({ restored: r.count, of: ids.length }, null, 1));
      return;
    }
    console.log("usage: --plan | --apply [--limit N] | --undo <file>");
  } finally {
    await prisma.$disconnect();
  }
})();
