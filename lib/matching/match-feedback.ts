import { prisma } from "@/lib/prisma";

/**
 * Recruiter feedback on the engine's read of a candidate ("good fit" / "off
 * base" + an optional reason). Captured now so we can learn from it later; not
 * yet fed back into scoring (see memory: candidate-scoring-engine).
 *
 * Stored in WorkspaceSetting (scope "candidate-scoring-feedback", one row per
 * requirement, value = { candidateId: entry }) — no schema migration needed.
 * Volume is low (a click per reviewed candidate); graduate to its own table
 * when we build the learning loop.
 */

/**
 * "under" and "over" are both a NO, recorded with the reason why: too little
 * experience for the seat, or too much. They are kept apart from a plain "down"
 * because the two point in opposite directions when this feeds scoring later —
 * an overqualified pilot is a retention risk on an SIC seat, not a weak
 * candidate, and is often the right person for a different opening.
 */
export type MatchVerdict = "up" | "neutral" | "down" | "under" | "over";

export const MATCH_VERDICTS: MatchVerdict[] = ["up", "neutral", "down", "under", "over"];

export type MatchFeedbackEntry = {
  verdict: MatchVerdict;
  reason: string;
  at: string; // ISO timestamp
  by: string | null; // actor email/name when known
};

export type RequirementFeedback = Record<string, MatchFeedbackEntry>;

const SCOPE = "candidate-scoring-feedback";

function normalize(raw: unknown): RequirementFeedback {
  if (!raw || typeof raw !== "object") return {};
  const out: RequirementFeedback = {};
  for (const [candidateId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const v = value as Partial<MatchFeedbackEntry>;
    if (!v.verdict || !MATCH_VERDICTS.includes(v.verdict)) continue;
    out[candidateId] = {
      verdict: v.verdict,
      reason: typeof v.reason === "string" ? v.reason.slice(0, 500) : "",
      at: typeof v.at === "string" ? v.at : "",
      by: typeof v.by === "string" ? v.by : null
    };
  }
  return out;
}

export async function getRequirementFeedback(requirementId: string): Promise<RequirementFeedback> {
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

/** One query: this candidate's feedback across every requirement (keyed by requirementId). */
export async function getCandidateFeedback(candidateId: string): Promise<Record<string, MatchFeedbackEntry>> {
  if (!candidateId) return {};
  const rows = await prisma.workspaceSetting.findMany({ where: { scope: SCOPE }, select: { key: true, valueJson: true } });
  const out: Record<string, MatchFeedbackEntry> = {};
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

export async function setMatchFeedback(params: {
  requirementId: string;
  candidateId: string;
  verdict: MatchVerdict | null; // null clears the entry (toggle off)
  reason?: string;
  by?: string | null;
  nowIso: string;
}): Promise<RequirementFeedback> {
  const { requirementId, candidateId, verdict, reason, by, nowIso } = params;
  const current = await getRequirementFeedback(requirementId);

  if (verdict === null) {
    delete current[candidateId];
  } else {
    current[candidateId] = {
      verdict,
      reason: (reason ?? "").slice(0, 500),
      at: nowIso,
      by: by ?? null
    };
  }

  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: requirementId } },
    create: { scope: SCOPE, key: requirementId, valueJson: JSON.stringify(current) },
    update: { valueJson: JSON.stringify(current) }
  });

  return current;
}
