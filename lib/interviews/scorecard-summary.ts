import {
  CORE_VALUE_NAMES,
  RATINGS,
  RATING_VALUE,
  RECOMMENDATIONS,
  interviewPoints,
  isRatingKey,
  isRecommendationKey,
  scorecardPoints,
  type Points,
  type RatingKey,
  type RecommendationKey,
  type ScorecardItem
} from "@/lib/interviews/scorecard";

// The one-line score summary on a candidate's interview card, beside the
// Scorecard button (his ask, Nov 16 2026: "Strong Yes first, and then the score:
// 4.5 points. Then Fueled by passion exceeds, Team alignment meets ... keep the
// text small so that it all fits inside of the current box").
//
// One scorecard: its recommendation, its points, and its rating per value.
// Several interviewers: every recommendation given (most positive first), the
// combined points (the average scorecard, the same number the popup shows), and
// per value the average rating rounded to the nearest step. PURE module.

export type ScoreSummary = {
  recommendations: Array<{ key: RecommendationKey; label: string; count: number }>;
  points: Points | null;
  values: Array<{ name: string; label: string }>;
  cards: number;
};

function parseItems(json: string): ScorecardItem[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((i) => i && typeof i.q === "string")
      .map((i) => ({ q: i.q as string, rating: isRatingKey(i.rating) ? i.rating : null, value: typeof i.value === "string" ? i.value : null }));
  } catch {
    return [];
  }
}

/** The rating step nearest an average of points (ties go to the higher step). */
function nearestRating(avg: number): RatingKey {
  let best: RatingKey = "MEETS";
  let gap = Infinity;
  for (const r of RATINGS) {
    const d = Math.abs(RATING_VALUE[r.key] - avg);
    if (d < gap - 1e-9) {
      gap = d;
      best = r.key;
    }
  }
  return best;
}

export function summarizeScorecards(cards: Array<{ recommendation: string | null; itemsJson: string }>): ScoreSummary | null {
  if (cards.length === 0) return null;
  const parsed = cards.map((c) => ({ rec: isRecommendationKey(c.recommendation) ? c.recommendation : null, items: parseItems(c.itemsJson) }));

  const recommendations = RECOMMENDATIONS.map((r) => ({ key: r.key, label: r.label, count: parsed.filter((p) => p.rec === r.key).length })).filter(
    (r) => r.count > 0
  );

  const values = CORE_VALUE_NAMES.flatMap((name) => {
    const ratings = parsed
      .map((p) => p.items.find((i) => i.value === name)?.rating)
      .filter((r): r is RatingKey => isRatingKey(r));
    if (ratings.length === 0) return [];
    const avg = ratings.reduce((a, r) => a + RATING_VALUE[r], 0) / ratings.length;
    const label = RATINGS.find((r) => r.key === nearestRating(avg))!.label;
    return [{ name, label }];
  });

  const points = interviewPoints(parsed.map((p) => scorecardPoints(p.items)));
  if (recommendations.length === 0 && values.length === 0 && points === null) return null;
  return { recommendations, points, values, cards: cards.length };
}
