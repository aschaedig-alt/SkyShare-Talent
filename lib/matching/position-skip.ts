/**
 * Skipping a candidate ON ONE POSITION.
 *
 * Distinct from the candidate-level scan exclusion in lib/candidates/scan-exclusion.ts,
 * which holds someone out of EVERY scan. This is per (requirement, candidate): the
 * person stays fully in the system and keeps competing for every other opening,
 * they are just set aside for this one.
 *
 * Nothing is deleted and nothing is hidden outright — set-aside candidates are
 * still returned by the scan, in their own group, so a wrong call is visible and
 * one click undoes it. That matters because the automatic overqualified catch
 * fires off self-reported hours, which are known to disagree between a
 * candidate's own documents.
 *
 * PURE module (no Prisma) so client components can import the labels; the
 * database side lives in position-skip.server.ts.
 */

export type PositionSkipReason =
  | "OVERQUALIFIED"
  | "UNDERQUALIFIED"
  | "NOT_A_FIT"
  | "DECLINED"
  | "OTHER";

export const POSITION_SKIP_REASONS: Array<{ key: PositionSkipReason; label: string; hint: string }> = [
  {
    key: "OVERQUALIFIED",
    label: "Overqualified for this seat",
    hint: "Too senior for the seat — a retention risk here, and often right for a different opening"
  },
  { key: "UNDERQUALIFIED", label: "Underqualified for this seat", hint: "Not enough experience for this position yet" },
  { key: "NOT_A_FIT", label: "Not a fit for this position", hint: "A judgement call about this role only" },
  { key: "DECLINED", label: "Declined / not interested", hint: "The candidate is not pursuing this opening" },
  { key: "OTHER", label: "Other", hint: "Another reason — add a note" }
];

export const POSITION_SKIP_LABELS: Record<PositionSkipReason, string> = Object.fromEntries(
  POSITION_SKIP_REASONS.map((reason) => [reason.key, reason.label])
) as Record<PositionSkipReason, string>;

const REASON_KEYS = new Set<string>(POSITION_SKIP_REASONS.map((reason) => reason.key));

export function isPositionSkipReason(value: unknown): value is PositionSkipReason {
  return typeof value === "string" && REASON_KEYS.has(value);
}

/**
 * "Keep this person on this position" — the counterpart to a skip, and the only
 * way to overrule the automatic overqualified catch.
 *
 * Simply clearing a skip is not enough: the engine would re-flag the candidate
 * on the very next scan and they would vanish again. Storing an explicit KEEP
 * records the recruiter's decision so it sticks. Deliberately NOT in
 * POSITION_SKIP_REASONS, which is the list the reason picker renders.
 */
export const KEEP_ON_POSITION = "KEEP" as const;

export type PositionDecisionValue = PositionSkipReason | typeof KEEP_ON_POSITION;

export function isPositionDecisionValue(value: unknown): value is PositionDecisionValue {
  return value === KEEP_ON_POSITION || isPositionSkipReason(value);
}

export type PositionSkip = {
  reason: PositionDecisionValue;
  note: string;
  at: string; // ISO timestamp
  by: string | null; // actor email/name when known
  /** True when the engine set this itself rather than a recruiter. */
  automatic: boolean;
};

export type RequirementSkips = Record<string, PositionSkip>;

/** Defensive: the stored value is user-editable JSON. */
export function normalizeSkips(raw: unknown): RequirementSkips {
  if (!raw || typeof raw !== "object") return {};
  const out: RequirementSkips = {};
  for (const [candidateId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const v = value as Partial<PositionSkip>;
    if (!isPositionDecisionValue(v.reason)) continue;
    out[candidateId] = {
      reason: v.reason,
      note: typeof v.note === "string" ? v.note.slice(0, 500) : "",
      at: typeof v.at === "string" ? v.at : "",
      by: typeof v.by === "string" ? v.by : null,
      automatic: v.automatic === true
    };
  }
  return out;
}
