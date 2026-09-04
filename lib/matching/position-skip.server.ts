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

/**
 * The same decision applied to MANY candidates on one position, in ONE write.
 *
 * Not a loop over setPositionSkip. Every skip for a requirement lives in a
 * single WorkspaceSetting row, so calling the single-candidate writer 40 times
 * is 40 reads and 40 upserts of the SAME row — and each one starts from a
 * snapshot taken before the previous write landed, so two of these running at
 * once (two tabs, or one recruiter who clicks twice) lose whichever finished
 * first. Reading once, applying every id, and writing once removes both.
 *
 * Returns `previous`: the stored value each changed id held BEFORE this call,
 * with an explicit null for an id that had no decision at all. That is what
 * makes a bulk skip undoable — restoring means writing this map straight back
 * through restorePositionSkips, rather than guessing that "undo" means clear.
 */
export async function setPositionSkipsBulk(params: {
  requirementId: string;
  candidateIds: string[];
  reason: PositionDecisionValue | null;
  note?: string;
  by?: string | null;
  nowIso: string;
}): Promise<{ skips: RequirementSkips; previous: Record<string, PositionSkip | null>; changed: number }> {
  const { requirementId, candidateIds, reason, note, by, nowIso } = params;
  const ids = [...new Set(candidateIds.filter(Boolean))];
  const current = await getRequirementSkips(requirementId);
  const previous: Record<string, PositionSkip | null> = {};

  for (const candidateId of ids) {
    previous[candidateId] = current[candidateId] ?? null;
    if (reason === null) {
      delete current[candidateId];
    } else {
      current[candidateId] = {
        reason,
        note: (note ?? "").slice(0, 500),
        at: nowIso,
        by: by ?? null,
        // A bulk skip is a recruiter's call on every person in it, not the
        // engine's — `automatic` stays false so the cards say who decided.
        automatic: false
      };
    }
  }

  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: requirementId } },
    create: { scope: SCOPE, key: requirementId, valueJson: JSON.stringify(current) },
    update: { valueJson: JSON.stringify(current) }
  });

  return { skips: current, previous, changed: ids.length };
}

/**
 * Put back exactly what a bulk call overwrote — the undo half of the pair.
 *
 * Takes the `previous` map returned above verbatim: a stored skip is written
 * back as it was (original reason, note, timestamp and author, so the record
 * does not claim the undo re-decided it), and a null clears the entry so the
 * engine's own judgement applies again. Ids absent from the map are untouched,
 * which is what keeps an undo from reaching work done since.
 */
export async function restorePositionSkips(params: {
  requirementId: string;
  previous: Record<string, PositionSkip | null>;
}): Promise<RequirementSkips> {
  const { requirementId, previous } = params;
  const current = await getRequirementSkips(requirementId);

  for (const [candidateId, skip] of Object.entries(previous)) {
    if (skip === null) delete current[candidateId];
    else current[candidateId] = skip;
  }

  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: requirementId } },
    create: { scope: SCOPE, key: requirementId, valueJson: JSON.stringify(current) },
    update: { valueJson: JSON.stringify(current) }
  });

  return current;
}
