// The check-in ratings - Quality of Hire. At 90 days, 6 months and 12 months the
// hiring manager rates SkyShare's four core values, says how well the person has
// learned their role, and whether they would hire them again. The SAME
// questionnaire every time (his call, Nov 13 2026); only the period changes, and
// each is stored as its own rating (HireCheckinRating.dayMark 90 / 180 / 365) so
// reports can show 90-day, 6-month and 12-month side by side. Client-safe: no Prisma.
//
// THE 1-10 FORM (his pick, Nov 13 2026, from a five-reviewer panel): each value is
// scored 1-10 in six word groups - 1 Does not meet | 2-3 Below the bar | 4-5 Can
// develop | 6-7 Meets | 8-9 Exceeds | 10 Sets the standard - colored red 1-3, amber
// 4-5, green 6-10. A value can be skipped ("Haven't seen it yet").
//
// NO REQUIRED REASONS, ON PURPOSE (his call, Nov 13): a box that must be filled
// for a low score or a "No" would make a supervisor switch to a higher score or a
// "Yes" to avoid the step. HR reads the data and talks to whoever chose 1-3 or No.
// The only text box is the optional notes, and it never blocks a submit.
//
// COMPARABLE WITH THE INTERVIEW BY CONSTRUCTION: every score maps to the
// interview scorecard's four words (1-3 Does Not Meet, 4-5 Can Develop, 6-7 Meets,
// 8-10 Exceeds), and THAT band is what is stored under each value name - so
// ratingPoints(), the Post-onboard cells and anything reading the bands works
// unchanged. The 1-10 detail rides alongside in the same JSON under SCALE_KEY, so
// this needed no schema change. A skipped value stores no band and a null score: it
// is never counted as a middle number.

import { CORE_VALUE_NAMES, isRatingKey, sumRatings, type Points, type RatingKey } from "@/lib/interviews/scorecard";

// ---------------------------------------------------------------------------
// Which check-ins carry a rating.

export type RatedCheckin = {
  /** HireCheckinRating.dayMark. */
  dayMark: number;
  /** The post-hire checklist task it ticks (lib/onboarding/tasks.ts MAINTENANCE_TASKS). */
  taskKey: string;
  /** "90-day" - column heads and short labels. */
  short: string;
  /** "90-day check-in" - headings and email subjects. */
  title: string;
  /** "their first 90 days" - in sentences about the person. */
  period: string;
  /** "90 days" - "compared with where we would expect someone to be at ..." */
  at: string;
};

export const RATED_CHECKINS: RatedCheckin[] = [
  { dayMark: 90, taskKey: "checkin_90", short: "90-day", title: "90-day check-in", period: "their first 90 days", at: "90 days" },
  { dayMark: 180, taskKey: "checkin_180", short: "6-month", title: "6-month check-in", period: "their first 6 months", at: "6 months" },
  { dayMark: 365, taskKey: "checkin_365", short: "12-month", title: "12-month check-in", period: "their first year", at: "12 months" }
];
export const RATED_DAY_MARKS = RATED_CHECKINS.map((c) => c.dayMark);
export const RATED_TASK_KEYS = RATED_CHECKINS.map((c) => c.taskKey);

export function ratedCheckin(dayMark: number): RatedCheckin | null {
  return RATED_CHECKINS.find((c) => c.dayMark === dayMark) ?? null;
}
export function ratedCheckinForTask(taskKey: string): RatedCheckin | null {
  return RATED_CHECKINS.find((c) => c.taskKey === taskKey) ?? null;
}
export function isRatedDayMark(v: unknown): v is number {
  return typeof v === "number" && RATED_DAY_MARKS.includes(v);
}

/** The 90-day mark, kept for callers that only ever meant the 90-day rating (Quality of Hire tracking). */
export const CHECKIN_RATING_DAY = 90;
/** The check-in a saved 90-day rating ticks done (his call, Nov 11: "Yes, tick it"). */
export const CHECKIN_RATING_TASK_KEY = "checkin_90";

/** What saving a rating did to its check-in, so the screen can follow. */
export type CheckinTickResult = { checkinDone: boolean; archived: boolean };

export type CheckinRatings = Partial<Record<string, RatingKey>>;

// ---------------------------------------------------------------------------
// The 1-10 scale.

export const SCALE_MIN = 1;
export const SCALE_MAX = 10;

/** The six word groups, in order. 1 and 10 stand alone. */
export const SCALE_GROUPS: Array<{ from: number; to: number; label: string }> = [
  { from: 1, to: 1, label: "Does not meet" },
  { from: 2, to: 3, label: "Below the bar" },
  { from: 4, to: 5, label: "Can develop" },
  { from: 6, to: 7, label: "Meets" },
  { from: 8, to: 9, label: "Exceeds" },
  { from: 10, to: 10, label: "Sets the standard" }
];

/** Fill color per score, banded the same way as the interview comparison: red 1-3, amber 4-5, green 6-10. */
export const SCALE_COLORS: Record<number, { fill: string; text: string }> = {
  1: { fill: "#b42318", text: "#ffffff" },
  2: { fill: "#c4320a", text: "#ffffff" },
  3: { fill: "#d9480f", text: "#ffffff" },
  4: { fill: "#e39b12", text: "#0d2c43" },
  5: { fill: "#eab308", text: "#0d2c43" },
  6: { fill: "#6aa84f", text: "#ffffff" },
  7: { fill: "#55a03f", text: "#ffffff" },
  8: { fill: "#3f9440", text: "#ffffff" },
  9: { fill: "#2b8a3e", text: "#ffffff" },
  10: { fill: "#1b7a34", text: "#ffffff" }
};

export function isScore(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= SCALE_MIN && v <= SCALE_MAX;
}

/** The word a score sits under, e.g. 7 -> "Meets". */
export function scoreWord(score: number): string {
  return SCALE_GROUPS.find((g) => score >= g.from && score <= g.to)?.label ?? "";
}

/** The interview word a score counts as: 1-3 Does Not Meet, 4-5 Can Develop, 6-7 Meets, 8-10 Exceeds. */
export function scoreBand(score: number): RatingKey {
  if (score <= 3) return "DOES_NOT_MEET";
  if (score <= 5) return "CAN_DEVELOP";
  if (score <= 7) return "MEETS";
  return "EXCEEDS";
}

// ---------------------------------------------------------------------------
// How well they have learned the role (his wording, Nov 13: not formal training -
// "how well are they doing in the role that they were hired for at the current
// time? Are they where we would expect them to be?").

export type RoleProgressKey = "BEHIND" | "ON_TRACK" | "AHEAD";
export const ROLE_PROGRESS: Array<{ key: RoleProgressKey; label: string; hint: string }> = [
  { key: "BEHIND", label: "Behind", hint: "slower than expected" },
  { key: "ON_TRACK", label: "On track", hint: "where we'd expect" },
  { key: "AHEAD", label: "Ahead", hint: "faster than expected" }
];
export const ROLE_PROGRESS_LABEL: Record<RoleProgressKey, string> = { BEHIND: "Behind", ON_TRACK: "On track", AHEAD: "Ahead" };
export function isRoleProgress(v: unknown): v is RoleProgressKey {
  return v === "BEHIND" || v === "ON_TRACK" || v === "AHEAD";
}

// ---------------------------------------------------------------------------
// Stored shape and view.

/** Where the 1-10 detail lives inside ratingsJson, beside the per-value bands. */
export const SCALE_KEY = "scale10";

export type CheckinScale = {
  /** value name -> 1-10, or null when the manager had not seen it yet. */
  scores: Record<string, number | null>;
  progress: RoleProgressKey | null;
};

export type CheckinRatingView = {
  newHireId: string;
  /** 90, 180 or 365 - which check-in this rating belongs to. */
  dayMark: number;
  /** The interview-word band per value - what points and comparisons read. */
  ratings: CheckinRatings;
  /** The 1-10 answers, or null for a rating saved before the 1-10 form. */
  scale: CheckinScale | null;
  wouldHireAgain: boolean | null;
  managerName: string | null;
  notes: string | null;
  enteredBy: string | null;
  updatedAt: string;
};

/** Only the four core values, only valid ratings. Ignores the SCALE_KEY entry. */
export function cleanRatings(raw: unknown): CheckinRatings {
  const out: CheckinRatings = {};
  if (!raw || typeof raw !== "object") return out;
  for (const name of CORE_VALUE_NAMES) {
    const v = (raw as Record<string, unknown>)[name];
    if (isRatingKey(v)) out[name] = v;
  }
  return out;
}

/** The 1-10 detail from a stored ratingsJson object, or null when it has none. */
export function readScale(raw: unknown): CheckinScale | null {
  if (!raw || typeof raw !== "object") return null;
  const s = (raw as Record<string, unknown>)[SCALE_KEY];
  if (!s || typeof s !== "object") return null;
  const o = s as Record<string, unknown>;
  const scores: Record<string, number | null> = {};
  const rawScores = (o.scores ?? {}) as Record<string, unknown>;
  for (const name of CORE_VALUE_NAMES) {
    if (name in rawScores) scores[name] = isScore(rawScores[name]) ? (rawScores[name] as number) : null;
  }
  return { scores, progress: isRoleProgress(o.progress) ? o.progress : null };
}

/**
 * The rating's points, the same way an interview scorecard is scored (Exceeds 1.5,
 * Meets 1, Can Develop 0.5, Does Not Meet 0; feedback cmwcobn71): Meets on all four
 * values is 4. Null when none are rated. Skipped values are left out of par too.
 */
export function ratingPoints(r: CheckinRatings): Points | null {
  return sumRatings(Object.values(r));
}

/** One line for a hover: "Fueled by Passion 7 · Team Alignment not seen · ... · Role: On track". */
export function scaleSummary(v: CheckinRatingView): string {
  if (!v.scale) return "Rated on the old four-word scale";
  const scale = v.scale;
  const parts = CORE_VALUE_NAMES.filter((n) => n in scale.scores).map((n) => `${n} ${scale.scores[n] ?? "not seen"}`);
  if (scale.progress) parts.push(`Role: ${ROLE_PROGRESS_LABEL[scale.progress]}`);
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// What a form sends, and the one check both entry points run.

/** One value's answer: a 1-10 score, "SKIP" (not seen yet), or nothing yet. */
export type ScoreAnswer = number | "SKIP" | null;

export type CheckinAnswers = {
  scores: Record<string, ScoreAnswer>;
  progress: RoleProgressKey | null;
  wouldHireAgain: boolean | null;
};

export function emptyAnswers(): CheckinAnswers {
  return { scores: Object.fromEntries(CORE_VALUE_NAMES.map((n) => [n, null])), progress: null, wouldHireAgain: null };
}

/** A saved rating back into form answers, for editing it in the app. */
export function answersFromView(v: CheckinRatingView | null): CheckinAnswers {
  const a = emptyAnswers();
  if (!v) return a;
  for (const name of CORE_VALUE_NAMES) {
    if (v.scale && name in v.scale.scores) a.scores[name] = v.scale.scores[name] ?? "SKIP";
  }
  a.progress = v.scale?.progress ?? null;
  a.wouldHireAgain = v.wouldHireAgain;
  return a;
}

/** What is still missing, in plain words, or [] when the answers can be saved. Every answer is one tap. */
export function missingAnswers(a: CheckinAnswers): string[] {
  const out: string[] = [];
  const unanswered = CORE_VALUE_NAMES.filter((n) => a.scores[n] !== "SKIP" && !isScore(a.scores[n]));
  if (unanswered.length) out.push(`a score (or "Haven't seen it yet") for ${unanswered.join(", ")}`);
  if (CORE_VALUE_NAMES.every((n) => a.scores[n] === "SKIP")) out.push("a score for at least one value");
  if (!a.progress) out.push("how well they have learned the role");
  if (a.wouldHireAgain === null) out.push("whether you would hire them again");
  return out;
}

/**
 * Check what a form posted and turn it into what is stored: the per-value bands
 * plus the 1-10 detail under SCALE_KEY. Runs on the server for BOTH the in-app
 * save and the manager's link, so neither can store something the other could not.
 */
export function parseAnswers(raw: unknown): { ok: true; ratingsJson: Record<string, unknown>; bands: CheckinRatings; wouldHireAgain: boolean } | { ok: false; message: string } {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawScores = (o.scores && typeof o.scores === "object" ? o.scores : {}) as Record<string, unknown>;
  const answers: CheckinAnswers = {
    scores: Object.fromEntries(CORE_VALUE_NAMES.map((n) => [n, rawScores[n] === "SKIP" ? "SKIP" : isScore(rawScores[n]) ? (rawScores[n] as number) : null])),
    progress: isRoleProgress(o.progress) ? o.progress : null,
    wouldHireAgain: typeof o.wouldHireAgain === "boolean" ? o.wouldHireAgain : null
  };
  const missing = missingAnswers(answers);
  if (missing.length) return { ok: false, message: `Still needed: ${missing.join("; ")}.` };

  const bands: CheckinRatings = {};
  const scores: Record<string, number | null> = {};
  for (const name of CORE_VALUE_NAMES) {
    const s = answers.scores[name];
    if (isScore(s)) {
      bands[name] = scoreBand(s);
      scores[name] = s;
    } else scores[name] = null;
  }
  const scale: CheckinScale = { scores, progress: answers.progress };
  return { ok: true, ratingsJson: { ...bands, [SCALE_KEY]: scale }, bands, wouldHireAgain: answers.wouldHireAgain as boolean };
}
