import { prisma } from "@/lib/prisma";

/**
 * Manual tier moves. When a recruiter drags/moves a candidate into a different
 * readiness group than the engine assigned, that choice is recorded here and
 * STICKS — it overrides the computed readiness on every future read. Captured
 * as an explicit learning signal (stronger than the thumbs up/down feedback in
 * match-feedback.ts); a later round can fold these into the scoring weights.
 *
 * Stored in WorkspaceSetting (scope "candidate-scoring-tier-override", one row
 * per requirement, value = { candidateId: tier }) — no schema migration needed.
 */

export type OverrideTier = "Strong signal" | "Worth a look" | "Needs review";

export const OVERRIDE_TIERS: OverrideTier[] = ["Strong signal", "Worth a look", "Needs review"];

export type TierOverrides = Record<string, OverrideTier>;

const SCOPE = "candidate-scoring-tier-override";

function isTier(value: unknown): value is OverrideTier {
  return value === "Strong signal" || value === "Worth a look" || value === "Needs review";
}

function normalize(raw: unknown): TierOverrides {
  if (!raw || typeof raw !== "object") return {};
  const out: TierOverrides = {};
  for (const [candidateId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isTier(value)) out[candidateId] = value;
  }
  return out;
}

export async function getRequirementTierOverrides(requirementId: string): Promise<TierOverrides> {
  if (!requirementId) return {};
  const setting = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key: requirementId },
    select: { valueJson: true }
  });
  if (!setting?.valueJson) return {};
  try {
    return normalize(JSON.parse(setting.valueJson));
  } catch {
    return {};
  }
}

/** One query: this candidate's tier overrides across every requirement (keyed by requirementId). */
export async function getCandidateTierOverrides(candidateId: string): Promise<TierOverrides> {
  if (!candidateId) return {};
  const rows = await prisma.workspaceSetting.findMany({ where: { scope: SCOPE }, select: { key: true, valueJson: true } });
  const out: TierOverrides = {};
  for (const row of rows) {
    if (!row.valueJson) continue;
    try {
      const map = normalize(JSON.parse(row.valueJson));
      if (map[candidateId]) out[row.key] = map[candidateId];
    } catch {
      // skip malformed row
    }
  }
  return out;
}

export async function setTierOverride(params: {
  requirementId: string;
  candidateId: string;
  tier: OverrideTier | null; // null clears the override (back to the computed tier)
}): Promise<TierOverrides> {
  const { requirementId, candidateId, tier } = params;
  const current = await getRequirementTierOverrides(requirementId);

  if (tier === null) {
    delete current[candidateId];
  } else {
    current[candidateId] = tier;
  }

  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: requirementId } },
    create: { scope: SCOPE, key: requirementId, valueJson: JSON.stringify(current) },
    update: { valueJson: JSON.stringify(current) }
  });

  return current;
}
