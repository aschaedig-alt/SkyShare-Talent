/**
 * Interview scorecard rubric — shared, client-safe constants and helpers.
 *
 * Each scorecard rates a set of questions on a 4-step rubric and carries an
 * overall recommendation.
 *
 * POINTS, NOT AN AVERAGE (Aimee, feedback cmwcobn71, values set by him Nov 11
 * 2026): "meets is a standard number so it should give one full point... if the
 * person meets in all 4 categories they would have 4 points." So each rating is
 * worth points and a scorecard's score is the SUM — Exceeds 1.5, Meets 1, Can
 * Develop 0.5, Does Not Meet 0 — read against "par", what Meets on everything
 * rated would score (1 point per rated item). Ratings are stored as keys, never
 * numbers, so changing these values rescored every saved scorecard at once and
 * rewrote no data.
 */

import { COMPANY_VALUES } from "@/lib/compliments/constants";

export type RatingKey = "EXCEEDS" | "MEETS" | "CAN_DEVELOP" | "DOES_NOT_MEET";
export type RecommendationKey = "STRONG_YES" | "YES" | "NO" | "STRONG_NO";

export const RATING_VALUE: Record<RatingKey, number> = {
  EXCEEDS: 1.5,
  MEETS: 1,
  CAN_DEVELOP: 0.5,
  DOES_NOT_MEET: 0
};

export const RATINGS: Array<{ key: RatingKey; label: string; value: number }> = [
  { key: "EXCEEDS", label: "Exceeds", value: RATING_VALUE.EXCEEDS },
  { key: "MEETS", label: "Meets", value: RATING_VALUE.MEETS },
  { key: "CAN_DEVELOP", label: "Can Develop", value: RATING_VALUE.CAN_DEVELOP },
  { key: "DOES_NOT_MEET", label: "Does Not Meet", value: RATING_VALUE.DOES_NOT_MEET }
];

/** A score in points, and par: what Meets on every rated item would score. */
export type Points = { points: number; par: number };

const round1 = (n: number) => Math.round(n * 10) / 10;

/** "1.5 points" style label for a single rating, for buttons and tooltips. */
export function ratingPointsLabel(key: RatingKey): string {
  const v = RATING_VALUE[key];
  return `${v} point${v === 1 ? "" : "s"}`;
}

/** Points from a set of ratings, or null when nothing is rated yet. */
export function sumRatings(ratings: Array<RatingKey | null | undefined>): Points | null {
  const rated = ratings.filter((r): r is RatingKey => isRatingKey(r));
  if (rated.length === 0) return null;
  return { points: round1(rated.reduce((acc, r) => acc + RATING_VALUE[r], 0)), par: rated.length * RATING_VALUE.MEETS };
}

/** "4.5 pts" / "—". */
export function pointsText(p: Points | null): string {
  return p === null ? "—" : `${Number.isInteger(p.points) ? p.points : p.points.toFixed(1)} pts`;
}

/** "Meets on all 4 = 4" — the benchmark beside a score. */
export function parText(p: Points | null): string {
  if (p === null) return "";
  return `Meets on all ${p.par} = ${p.par}`;
}

export const RATING_LABEL: Record<RatingKey, string> = {
  EXCEEDS: "Exceeds",
  MEETS: "Meets",
  CAN_DEVELOP: "Can Develop",
  DOES_NOT_MEET: "Does Not Meet"
};

export const RECOMMENDATIONS: Array<{ key: RecommendationKey; label: string }> = [
  { key: "STRONG_YES", label: "Strong yes" },
  { key: "YES", label: "Yes" },
  { key: "NO", label: "No" },
  { key: "STRONG_NO", label: "Strong no" }
];

export const RECOMMENDATION_LABEL: Record<RecommendationKey, string> = {
  STRONG_YES: "Strong yes",
  YES: "Yes",
  NO: "No",
  STRONG_NO: "Strong no"
};

/** `value` marks one of the four core-value rows (its name); plain questions have none. */
export type ScorecardItem = { q: string; rating: RatingKey | null; value?: string | null };

/**
 * SkyShare's four core values, rated on every scorecard on the same 1-4 scale as
 * the questions - Quality of Hire, Nov 10 2026: rated at the interview and again at
 * the 90-day check-in, so the two can be compared ("how accurate are we?").
 */
export const CORE_VALUE_NAMES = COMPANY_VALUES.map((v) => v.name);

/** The scorecard's items with the four core-value rows first, each once, then the rest. */
export function withCoreValues(items: ScorecardItem[]): ScorecardItem[] {
  const values = CORE_VALUE_NAMES.map(
    (name) => items.find((i) => i.value === name) ?? { q: name, rating: null, value: name }
  );
  return [...values, ...items.filter((i) => !i.value || !CORE_VALUE_NAMES.includes(i.value))];
}

export function isRatingKey(value: unknown): value is RatingKey {
  return value === "EXCEEDS" || value === "MEETS" || value === "CAN_DEVELOP" || value === "DOES_NOT_MEET";
}

export function isRecommendationKey(value: unknown): value is RecommendationKey {
  return value === "STRONG_YES" || value === "YES" || value === "NO" || value === "STRONG_NO";
}

/** A scorecard's points: the sum over its rated items. */
export function scorecardPoints(items: ScorecardItem[]): Points | null {
  return sumRatings(items.map((i) => i.rating));
}

/**
 * The interview's combined score: the AVERAGE scorecard, so each interviewer
 * counts equally and a third interviewer does not inflate the number. Par is
 * averaged the same way (interviewers may rate different numbers of questions).
 */
export function interviewPoints(cards: Array<Points | null>): Points | null {
  const vals = cards.filter((c): c is Points => c !== null);
  if (vals.length === 0) return null;
  return {
    points: round1(vals.reduce((a, c) => a + c.points, 0) / vals.length),
    par: round1(vals.reduce((a, c) => a + c.par, 0) / vals.length)
  };
}
