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

export type MatchVerdict = "up" | "down";

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
    if (v.verdict !== "up" && v.verdict !== "down") continue;
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
