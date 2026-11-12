// The 90-day check-in rating - Quality of Hire, Dec 10 2026. HR enters it from the
// hiring manager's answers (his decision, Nov 10). The manager rates SkyShare's four
// core values on the interview scorecard's own rubric and points, so the two can be compared,
// and says whether they would hire the person again. Client-safe: no Prisma here.

import { CORE_VALUE_NAMES, isRatingKey, sumRatings, type Points, type RatingKey } from "@/lib/interviews/scorecard";

export const CHECKIN_RATING_DAY = 90;
/** The check-in a saved rating ticks done (his call, Nov 11: "Yes, tick it"). */
export const CHECKIN_RATING_TASK_KEY = "checkin_90";

/** What saving a rating did to the 90-day check-in, so the screen can follow. */
export type CheckinTickResult = { checkinDone: boolean; archived: boolean };

export type CheckinRatings = Partial<Record<string, RatingKey>>;

export type CheckinRatingView = {
  newHireId: string;
  dayMark: number;
  ratings: CheckinRatings;
  wouldHireAgain: boolean | null;
  managerName: string | null;
  notes: string | null;
  enteredBy: string | null;
  updatedAt: string;
};

/** Only the four core values, only valid ratings. */
export function cleanRatings(raw: unknown): CheckinRatings {
  const out: CheckinRatings = {};
  if (!raw || typeof raw !== "object") return out;
  for (const name of CORE_VALUE_NAMES) {
    const v = (raw as Record<string, unknown>)[name];
    if (isRatingKey(v)) out[name] = v;
  }
  return out;
}

/**
 * The rating's points, the same way an interview scorecard is scored (Exceeds 1.5,
 * Meets 1, Can Develop 0.5, Does Not Meet 0; feedback cmwcobn71): Meets on all four
 * values is 4. Null when none are rated.
 */
export function ratingPoints(r: CheckinRatings): Points | null {
  return sumRatings(Object.values(r));
}
