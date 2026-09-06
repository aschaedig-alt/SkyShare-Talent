import { prisma } from "@/lib/prisma";
import {
  CANDIDATE_STAGES,
  sanitizeStageList,
  type CandidateStage
} from "@/lib/candidates/stages";

/**
 * The editable pipeline stage list.
 *
 * Stage used to be free text, which is how you get a pipeline nobody can filter
 * on — one typo makes a stage of one. So it became a fixed list in code, which
 * fixed that and created a new problem: changing it needed a developer and a
 * deploy. This is the middle: still a controlled list, but one somebody can
 * edit at /candidates/manage.
 *
 * NOTHING IS EVER MIGRATED. Renaming or retiring a stage changes what the
 * pickers OFFER and nothing else — every candidate keeps the value stored on
 * them, and stageOptionsFor surfaces an off-list value under "Current" so
 * opening a dropdown can never silently rewrite somebody's record. That is the
 * whole reason this is safe to edit.
 *
 * Same WorkspaceSetting pattern the fleet crew roster uses: a stored row wins
 * over the seeded constant, and deleting the row falls back to the seed.
 */
const SCOPE = "candidate-vocab";
const KEY = "stages";

export async function getStageList(): Promise<CandidateStage[]> {
  const setting = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key: KEY },
    select: { valueJson: true }
  });
  if (!setting?.valueJson) return CANDIDATE_STAGES;
  try {
    return sanitizeStageList(JSON.parse(setting.valueJson));
  } catch {
    // A corrupt row must not leave the pickers empty.
    return CANDIDATE_STAGES;
  }
}

export async function saveStageList(raw: unknown): Promise<CandidateStage[]> {
  const clean = sanitizeStageList(raw);
  const existing = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key: KEY },
    select: { id: true }
  });
  const valueJson = JSON.stringify(clean);
  if (existing) {
    await prisma.workspaceSetting.update({ where: { id: existing.id }, data: { valueJson } });
  } else {
    await prisma.workspaceSetting.create({ data: { scope: SCOPE, key: KEY, valueJson } });
  }
  return clean;
}

/**
 * How many candidates sit on each stage, including values no longer offered.
 *
 * The editor needs this to warn before retiring something people are still on —
 * the record survives either way, but "9 people are here" is the difference
 * between an informed decision and a surprise.
 */
export async function getStageUsage(): Promise<Record<string, number>> {
  const rows = await prisma.candidate.groupBy({
    by: ["stage"],
    where: { status: { not: "MERGED" } },
    _count: true
  });
  const out: Record<string, number> = {};
  for (const r of rows) {
    const key = (r.stage ?? "").trim();
    if (key) out[key.toLowerCase()] = (out[key.toLowerCase()] ?? 0) + r._count;
  }
  return out;
}
