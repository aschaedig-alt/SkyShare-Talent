import { prisma } from "@/lib/prisma";
import {
  normalizeSkips,
  type PositionDecisionValue,
  type PositionSkip,
  type RequirementSkips
} from "@/lib/matching/position-skip";

/**
 * Database side of the per-position skip list. Stored in WorkspaceSetting
 * (scope "candidate-scoring-position-skip", one row per requirement, value =
 * { candidateId: skip }) — the same shape as the tier overrides and match
 * feedback beside it, so no schema migration is needed. Volume is a click per
 * set-aside candidate; graduate to its own table if that ever changes.
 */

const SCOPE = "candidate-scoring-position-skip";

export async function getRequirementSkips(requirementId: string): Promise<RequirementSkips> {
  if (!requirementId) return {};
  const setting = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key: requirementId },
    select: { valueJson: true }
  });
  if (!setting?.valueJson) return {};
  try {
    return normalizeSkips(JSON.parse(setting.valueJson));
  } catch {
    return {};
  }
}

/** One query: everywhere this candidate is set aside, keyed by requirementId. */
export async function getCandidateSkips(candidateId: string): Promise<Record<string, PositionSkip>> {
  if (!candidateId) return {};
  const rows = await prisma.workspaceSetting.findMany({ where: { scope: SCOPE }, select: { key: true, valueJson: true } });
  const out: Record<string, PositionSkip> = {};
  for (const row of rows) {
    if (!row.valueJson) continue;
    try {
      const map = normalizeSkips(JSON.parse(row.valueJson));
      if (map[candidateId]) out[row.key] = map[candidateId];
    } catch {
      // skip malformed row
    }
  }
  return out;
}

export async function setPositionSkip(params: {
  requirementId: string;
  candidateId: string;
  /**
   * A skip reason sets the candidate aside; KEEP pins them into the ranked list
   * against the automatic catch; null forgets the decision entirely (so the
   * engine's own judgement applies again).
   */
  reason: PositionDecisionValue | null;
  note?: string;
  by?: string | null;
  automatic?: boolean;
  nowIso: string;
}): Promise<RequirementSkips> {
  const { requirementId, candidateId, reason, note, by, automatic, nowIso } = params;
  const current = await getRequirementSkips(requirementId);

  if (reason === null) {
    delete current[candidateId];
  } else {
    current[candidateId] = {
      reason,
      note: (note ?? "").slice(0, 500),
      at: nowIso,
      by: by ?? null,
      automatic: automatic === true
    };
  }

  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: requirementId } },
    create: { scope: SCOPE, key: requirementId, valueJson: JSON.stringify(current) },
    update: { valueJson: JSON.stringify(current) }
  });

  return current;
}
