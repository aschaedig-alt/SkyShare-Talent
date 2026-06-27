import { normalizeEmail, normalizeName, normalizePhone } from "../candidates/normalize";

// Weighted match scoring for deduping an incoming (e.g. Jazz) person against the
// candidates already in the system. Email is the strongest signal, then phone,
// then exact normalized name. Thresholds err on the side of NOT merging:
//   >= AUTO_MERGE_AT  → confident same person, link automatically
//   >= REVIEW_AT      → uncertain, queue a DuplicateReviewItem for a human
//   below             → treat as a new person
export const AUTO_MERGE_AT = 60;
export const REVIEW_AT = 35;

export const WEIGHTS = { email: 50, phone: 25, name: 20 } as const;

export type ExistingCandidate = {
  id: string;
  displayName: string;
  normalizedEmail: string | null;
  normalizedPhone: string | null;
  normalizedName: string | null;
};

export type IncomingPerson = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
};

export type MatchDecision = "CREATE" | "AUTO_MERGE" | "REVIEW";

export type MatchResult = {
  decision: MatchDecision;
  score: number;
  matchedId: string | null;
  matchedName: string | null;
  reasons: string[];
};

export function normalizedPersonName(p: IncomingPerson): string | null {
  return normalizeName([p.firstName, p.lastName].filter(Boolean).join(" "));
}

export function scoreMatch(incoming: IncomingPerson, existing: ExistingCandidate[]): MatchResult {
  const inEmail = normalizeEmail(incoming.email);
  const inPhone = normalizePhone(incoming.phone);
  const inName = normalizedPersonName(incoming);

  let best: { score: number; reasons: string[]; ex: ExistingCandidate } | null = null;

  for (const ex of existing) {
    let score = 0;
    const reasons: string[] = [];
    if (inEmail && ex.normalizedEmail && inEmail === ex.normalizedEmail) {
      score += WEIGHTS.email;
      reasons.push("email exact");
    }
    if (inPhone && ex.normalizedPhone && inPhone === ex.normalizedPhone) {
      score += WEIGHTS.phone;
      reasons.push("phone exact");
    }
    if (inName && ex.normalizedName && inName === ex.normalizedName) {
      score += WEIGHTS.name;
      reasons.push("name exact");
    }
    if (score > 0 && (!best || score > best.score)) best = { score, reasons, ex };
  }

  if (!best) return { decision: "CREATE", score: 0, matchedId: null, matchedName: null, reasons: [] };

  const decision: MatchDecision =
    best.score >= AUTO_MERGE_AT ? "AUTO_MERGE" : best.score >= REVIEW_AT ? "REVIEW" : "CREATE";

  return {
    decision,
    score: best.score,
    matchedId: decision === "CREATE" ? null : best.ex.id,
    matchedName: decision === "CREATE" ? null : best.ex.displayName,
    reasons: best.reasons,
  };
}
