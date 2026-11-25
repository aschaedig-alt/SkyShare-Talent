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
  /** "3-month" - column heads and short labels. */
  short: string;
  /** "3-month check-in" - headings and email subjects. */
  title: string;
  /** "their first 90 days" - in sentences about the person. */
  period: string;
  /** "90 days" - "compared with where we would expect someone to be at ..." */
  at: string;
  /** An anytime check-in (see ANYTIME_BASE): no checklist task, nothing to tick or archive. */
  anytime?: true;
};

export const RATED_CHECKINS: RatedCheckin[] = [
  // Shown as "3-month" (his call, Nov 14 2026, to match 6-month and 12-month); the
  // stored day mark and task key stay 90 / checkin_90.
  { dayMark: 90, taskKey: "checkin_90", short: "3-month", title: "3-month check-in", period: "their first 3 months", at: "3 months" },
  { dayMark: 180, taskKey: "checkin_180", short: "6-month", title: "6-month check-in", period: "their first 6 months", at: "6 months" },
  { dayMark: 365, taskKey: "checkin_365", short: "12-month", title: "12-month check-in", period: "their first year", at: "12 months" }
];
export const RATED_DAY_MARKS = RATED_CHECKINS.map((c) => c.dayMark);
export const RATED_TASK_KEYS = RATED_CHECKINS.map((c) => c.taskKey);

// ---------------------------------------------------------------------------
// ANYTIME CHECK-INS (his ask, Nov 19 2026: a manager check-in for someone who has
// been here 1 year 7 months - there was no way to send one after the first year).
//
// The same questionnaire and the same no-login link, for anyone past their first
// year, sent whenever HR chooses. Its day mark ENCODES the person's tenure in whole
// calendar months on the day it is sent: ANYTIME_BASE + months (10019 = 1 year 7
// months). Months, not days, so the label is exact ("Check-in at 1 year 7 months"
// matches the calendar - a day count cannot, months differ in length), and two sends
// in the same month are one check-in (a resend), not two. Each is its own rating
// (HireCheckinRating is one per person per day mark), sorts in time order, and can
// never be mistaken for the 90/180/365 ones. It has no checklist task: saving one
// ticks nothing and archives nobody, and archived people - most people past a
// year - can still be asked (only terminated or cancelled counts as gone).

export const ANYTIME_BASE = 10_000;
const ANYTIME_MIN_MONTHS = 12;
const ANYTIME_MAX_MONTHS = 720;

export function isAnytimeDayMark(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= ANYTIME_BASE + ANYTIME_MIN_MONTHS && v <= ANYTIME_BASE + ANYTIME_MAX_MONTHS;
}

/** "1 year 7 months" for a tenure in whole months. */
export function tenureWords(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = years ? `${years} year${years === 1 ? "" : "s"}` : "";
  const m = rest ? `${rest} month${rest === 1 ? "" : "s"}` : "";
  return [y, m].filter(Boolean).join(" ") || "under a month";
}

function anytimeCheckin(dayMark: number): RatedCheckin {
  const words = tenureWords(dayMark - ANYTIME_BASE);
  return { dayMark, taskKey: "", short: words, title: `Check-in at ${words}`, period: `their ${words} with us`, at: words, anytime: true };
}

/** Today's date in Mountain time, as [year, month 0-11, day] - after 6pm Mountain, UTC is already tomorrow. */
function mountainToday(now: Date): [number, number, number] {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return [get("year"), get("month") - 1, get("day")];
}

/**
 * The anytime day mark for a check-in sent today: ANYTIME_BASE + whole calendar
 * months since the start date (a start date is a calendar day, read in UTC like
 * every other one in the app). Null before a year, or with no start date.
 */
export function anytimeDayMarkFor(startDate: string | Date | null | undefined, now: Date = new Date()): number | null {
  if (!startDate) return null;
  const s = new Date(startDate);
  if (Number.isNaN(s.getTime())) return null;
  const [ty, tm, td] = mountainToday(now);
  let months = (ty - s.getUTCFullYear()) * 12 + (tm - s.getUTCMonth());
  if (td < s.getUTCDate()) months--;
  return months >= ANYTIME_MIN_MONTHS ? ANYTIME_BASE + Math.min(months, ANYTIME_MAX_MONTHS) : null;
}

export function ratedCheckin(dayMark: number): RatedCheckin | null {
  return RATED_CHECKINS.find((c) => c.dayMark === dayMark) ?? (isAnytimeDayMark(dayMark) ? anytimeCheckin(dayMark) : null);
}
export function ratedCheckinForTask(taskKey: string): RatedCheckin | null {
  return RATED_CHECKINS.find((c) => c.taskKey === taskKey) ?? null;
}
export function isRatedDayMark(v: unknown): v is number {
  return typeof v === "number" && (RATED_DAY_MARKS.includes(v) || isAnytimeDayMark(v));
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
  /** Each supervisor's own answers when two rated it ([] for one); the fields above are then their average. */
  raters: CheckinRaterView[];
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
    if (name in rawScores) scores[name] = isStoredScore(rawScores[name]) ? Math.round((rawScores[name] as number) * 10) / 10 : null;
  }
  return { scores, progress: isRoleProgress(o.progress) ? o.progress : null };
}

/**
 * A STORED score: a whole 1-10 from one form, or the average of two supervisors'
 * scores, which can be a half (7.5). Input from a form is still checked with
 * isScore - only an average is ever fractional.
 */
export function isStoredScore(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= SCALE_MIN && v <= SCALE_MAX;
}

/** The color for a stored score - an average like 7.5 takes the color of its rounded score. */
export function scoreColor(v: number): { fill: string; text: string } | null {
  return SCALE_COLORS[Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(v)))] ?? null;
}

// ---------------------------------------------------------------------------
// TWO SUPERVISORS, ONE CHECK-IN (Aimee, Nov 25 2026, feedback cmwwiir1m: "if i
// need to send the same review ... to two supervisors (like chief pilot and
// assistant chief pilot) i want them to each individually receive the review
// link, then when i view the results id like the main number to be the average of
// the 2 scores. then give me the option to view both scores.")
//
// The stored rating stays ONE row per person per check-in (HireCheckinRating is
// unique on newHireId + dayMark), so every report, cell and points calculation
// reads the AVERAGE without knowing about it. Each supervisor's own answers ride
// along in the same JSON under RATERS_KEY - no schema change, the same trade as
// SCALE_KEY. The average is written once no link in the group is still waiting
// (lib/onboarding/checkin-rating-request.ts maybeFinalizeGroup), so the check-in
// is only marked done when both have rated.
//
// How each part averages:
//   scores      the mean of the scores given, to one decimal; a value neither
//               supervisor has seen yet stays "not seen".
//   bands       from the ROUNDED average score, the same scoreBand as one form.
//   progress    Behind -1 / On track 0 / Ahead +1, averaged; half-way reads On track.
//   hire again  a split ("1 yes, 1 no") counts as NO - the answer HR has to see
//               (his default, Nov 25 2026). Each answer shows in the raters list.

export const RATERS_KEY = "raters";

export type CheckinRaterView = {
  name: string | null;
  email: string | null;
  ratings: CheckinRatings;
  scale: CheckinScale | null;
  wouldHireAgain: boolean | null;
  notes: string | null;
  at: string | null;
};

/** One supervisor's answers, as kept on their request until the group is complete. */
export type RaterAnswers = {
  name: string | null;
  email: string | null;
  /** parseAnswers' ratingsJson: bands + SCALE_KEY. */
  ratingsJson: Record<string, unknown>;
  wouldHireAgain: boolean;
  notes: string | null;
  at: string;
};

/** The per-supervisor answers inside a stored ratingsJson, or [] for a one-person rating. */
export function readRaters(raw: unknown): CheckinRaterView[] {
  if (!raw || typeof raw !== "object") return [];
  const list = (raw as Record<string, unknown>)[RATERS_KEY];
  if (!Array.isArray(list)) return [];
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  return list
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
    .map((x) => ({
      name: str(x.name),
      email: str(x.email),
      ratings: cleanRatings(x.ratingsJson),
      scale: readScale(x.ratingsJson),
      wouldHireAgain: typeof x.wouldHireAgain === "boolean" ? x.wouldHireAgain : null,
      notes: str(x.notes),
      at: str(x.at)
    }));
}

/** One supervisor's answers, in the same shape as a row's scores. */
export type CheckinRaterRow = { name: string | null; scores: (number | null)[]; progress: RoleProgressKey | null; hireAgain: boolean | null; note: string | null; at: string | null };

/** The rater rows for a rating's per-supervisor answers - also used by the Post-onboard rating form. */
export function raterRows(raters: CheckinRaterView[]): CheckinRaterRow[] {
  return raters.map((x) => ({
    name: x.name ?? x.email,
    scores: CORE_VALUE_NAMES.map((v) => x.scale?.scores[v] ?? null),
    progress: x.scale?.progress ?? null,
    hireAgain: x.wouldHireAgain,
    note: x.notes,
    at: x.at
  }));
}

const PROGRESS_NUM: Record<RoleProgressKey, number> = { BEHIND: -1, ON_TRACK: 0, AHEAD: 1 };

/** The averaged rating for a group of supervisors, with each one's own answers under RATERS_KEY. */
export function averageRaters(raters: RaterAnswers[]): { ratingsJson: Record<string, unknown>; wouldHireAgain: boolean } {
  const scales = raters.map((r) => readScale(r.ratingsJson));
  const bands: CheckinRatings = {};
  const scores: Record<string, number | null> = {};
  for (const name of CORE_VALUE_NAMES) {
    const given = scales.map((s) => s?.scores[name]).filter((v): v is number => typeof v === "number");
    if (given.length) {
      const avg = Math.round((given.reduce((a, b) => a + b, 0) / given.length) * 10) / 10;
      scores[name] = avg;
      bands[name] = scoreBand(Math.round(avg));
    } else scores[name] = null;
  }
  const progressGiven = scales.map((s) => s?.progress).filter((p): p is RoleProgressKey => Boolean(p));
  let progress: RoleProgressKey | null = null;
  if (progressGiven.length) {
    // Half-way (one On track, one Ahead or Behind) reads On track, the same either way.
    const m = progressGiven.reduce((a, p) => a + PROGRESS_NUM[p], 0) / progressGiven.length;
    progress = m < -0.5 ? "BEHIND" : m > 0.5 ? "AHEAD" : "ON_TRACK";
  }
  const scale: CheckinScale = { scores, progress };
  return {
    ratingsJson: {
      ...bands,
      [SCALE_KEY]: scale,
      [RATERS_KEY]: raters.map((r) => ({ name: r.name, email: r.email, ratingsJson: r.ratingsJson, wouldHireAgain: r.wouldHireAgain, notes: r.notes, at: r.at }))
    },
    wouldHireAgain: raters.every((r) => r.wouldHireAgain)
  };
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
    // Rounded: an averaged rating can hold a half, and the form takes whole numbers.
    if (v.scale && name in v.scale.scores) {
      const s = v.scale.scores[name];
      a.scores[name] = s === null || s === undefined ? "SKIP" : Math.round(s);
    }
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
