/**
 * Interview scorecard rubric — shared, client-safe constants and helpers.
 *
 * Each scorecard rates a set of questions on a 4-point rubric and carries an
 * overall recommendation. Ratings map to 1–4 so scorecards (and whole
 * interviews) can be averaged and compared.
 */

export type RatingKey = "EXCEEDS" | "MEETS" | "CAN_DEVELOP" | "DOES_NOT_MEET";
export type RecommendationKey = "STRONG_YES" | "YES" | "NO" | "STRONG_NO";

export const RATINGS: Array<{ key: RatingKey; label: string; value: number }> = [
  { key: "EXCEEDS", label: "Exceeds", value: 4 },
  { key: "MEETS", label: "Meets", value: 3 },
  { key: "CAN_DEVELOP", label: "Can Develop", value: 2 },
  { key: "DOES_NOT_MEET", label: "Does Not Meet", value: 1 }
];

export const RATING_VALUE: Record<RatingKey, number> = {
  EXCEEDS: 4,
  MEETS: 3,
  CAN_DEVELOP: 2,
  DOES_NOT_MEET: 1
};

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

export type ScorecardItem = { q: string; rating: RatingKey | null };

export function isRatingKey(value: unknown): value is RatingKey {
  return value === "EXCEEDS" || value === "MEETS" || value === "CAN_DEVELOP" || value === "DOES_NOT_MEET";
}

export function isRecommendationKey(value: unknown): value is RecommendationKey {
  return value === "STRONG_YES" || value === "YES" || value === "NO" || value === "STRONG_NO";
}

/** Average of the rated items (1–4), or null when nothing is rated yet. */
export function scorecardAverage(items: ScorecardItem[]): number | null {
  const rated = items.filter((i) => i.rating && isRatingKey(i.rating));
  if (rated.length === 0) return null;
  const sum = rated.reduce((acc, i) => acc + RATING_VALUE[i.rating as RatingKey], 0);
  return Math.round((sum / rated.length) * 10) / 10;
}

/** Average of the per-scorecard averages (each interviewer weighted equally). */
export function interviewAverage(scorecardAverages: Array<number | null>): number | null {
  const vals = scorecardAverages.filter((v): v is number => v !== null);
  if (vals.length === 0) return null;
  const sum = vals.reduce((a, b) => a + b, 0);
  return Math.round((sum / vals.length) * 10) / 10;
}
