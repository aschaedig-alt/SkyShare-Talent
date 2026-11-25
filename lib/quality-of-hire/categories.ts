import type { QohHire } from "@/lib/quality-of-hire/report";

// The Good Hire Criteria - how SkyShare decides whether a hire worked out. Agreed by HR
// on Nov 23 2026 on the Good Hire Criteria review page (with Kevin Sherman, director of
// HR, on the neutral case). Seven categories, plus "needs a call" for a hire nobody has
// decided yet. This file is the ONE place the rules live, so the Quality of Hire tab and
// any script sort people the same way. Client-safe: no database here.
//
//   Good hire        at 12 months the manager would hire them again. Hired before the
//                    check-ins: stayed a year and was not let go for a reason about them.
//   Satisfactory     a good hire for what we needed then, but not a long-term fit.
//   Neutral          left, by choice or not, without being clearly good or bad - one
//                    serious mistake after a good record, or a change after they started.
//   Bad hire         let go in year one for a reason about the person, or the manager
//                    would not hire them again; or a hiring mistake / poor performance
//                    that showed in year one but ended things later.
//   Regretted loss   left on their own and the manager would have kept them.
//   Too soon to say  still here, under 12 months.
//   Not counted      layoffs, medical, moves, retirement, business-caused, contractors.
//
// Satisfactory and Neutral are never worked out from the data: HR and the hiring manager
// decide them, one hire at a time (an "HR call", lib/quality-of-hire/category-calls.ts).
// Anyone let go after their first year for a reason about them waits for that call.

export type QohCategory = "GOOD" | "SATISFACTORY" | "NEUTRAL" | "BAD" | "REGRETTED" | "TOO_SOON" | "NOT_COUNTED" | "NEEDS_CALL";

/** What HR can decide by hand for one hire period. */
export const CALL_CATEGORIES = ["GOOD", "SATISFACTORY", "NEUTRAL", "BAD", "REGRETTED", "NOT_COUNTED"] as const;
export type CallCategory = (typeof CALL_CATEGORIES)[number];
export const isCallCategory = (v: unknown): v is CallCategory => typeof v === "string" && (CALL_CATEGORIES as readonly string[]).includes(v);

/** HR's decision on one hire period, with who made it. */
export type CategoryCall = { category: CallCategory; note: string | null; by: string | null; at: string };

/** A 90-day, 6-month or 12-month manager check-in, reduced to what the rules read. */
export type HireCheckin = { dayMark: number; wouldHireAgain: boolean | null; valuesAverage: number | null };

export const CATEGORY_META: Record<QohCategory, { label: string; hint: string }> = {
  GOOD: { label: "Good hire", hint: "At 12 months the manager would hire them again" },
  SATISFACTORY: { label: "Satisfactory hire", hint: "Right for what we needed then, not a long-term fit" },
  NEUTRAL: { label: "Neutral hire", hint: "Not clearly good or bad - nothing in hiring would have changed it" },
  BAD: { label: "Bad hire", hint: "Let go in year one for a reason about them, or the manager would not hire them again" },
  REGRETTED: { label: "Regretted loss", hint: "Left on their own, and the manager would have kept them" },
  TOO_SOON: { label: "Too soon to say", hint: "Still here, hired less than 12 months ago" },
  NOT_COUNTED: { label: "Not counted", hint: "Layoffs, moves, retirement, exits the business caused, contractors" },
  NEEDS_CALL: { label: "Needs a call", hint: "HR and the hiring manager still need to decide" }
};

export const CATEGORY_ORDER: QohCategory[] = ["GOOD", "SATISFACTORY", "NEUTRAL", "BAD", "REGRETTED", "TOO_SOON", "NOT_COUNTED", "NEEDS_CALL"];

/** The verdicts on a hire - what a share of hires is worked out over. */
export const DECIDED: QohCategory[] = ["GOOD", "SATISFACTORY", "NEUTRAL", "BAD", "REGRETTED"];

/** Paycom reasons that are about the person. */
export const PERSON_REASONS = new Set(["Performance", "Misconduct / Policy Violation(s)", "Gross Misconduct", "Failure to Complete Trg/Cert"]);
export const LAYOFF_REASONS = new Set(["Position Elimination / Layoff"]);
export const NOT_COUNTED_QUITS = new Set(["Moving", "Retirement"]);

/** The 12-month core values average below which a "yes, would hire again" still gets a second look. */
export const VALUES_FLOOR = 6;

export type HireFacts = Pick<
  QohHire,
  "contractor" | "situational" | "stillHere" | "tenureDays" | "left365" | "rosterExit" | "voluntary" | "reason" | "wouldHireBack" | "call" | "checkins"
>;

export type Categorized = { category: QohCategory; why: string; byHr: boolean };

const yearOneVerdict = (h: HireFacts, stayed: string): Categorized => {
  const at12 = h.checkins.find((c) => c.dayMark === 365);
  if (at12?.wouldHireAgain === false) return { category: "BAD", why: "12-month check-in: would not hire again", byHr: false };
  if (at12?.wouldHireAgain === true && at12.valuesAverage !== null && at12.valuesAverage < VALUES_FLOOR) {
    return { category: "NEEDS_CALL", why: `Would hire again, but core values average ${at12.valuesAverage.toFixed(1)} at 12 months`, byHr: false };
  }
  if (at12?.wouldHireAgain === true) return { category: "GOOD", why: "12-month check-in: would hire again", byHr: false };
  return { category: "GOOD", why: stayed, byHr: false };
};

export function categorize(h: HireFacts): Categorized {
  if (h.contractor) return { category: "NOT_COUNTED", why: "Contractor at hire", byHr: false };
  if (h.situational) return { category: "NOT_COUNTED", why: `Caused by the business: ${h.situational}`, byHr: false };
  if (h.call) return { category: h.call.category, why: h.call.note ? `HR's call: ${h.call.note}` : "HR's call", byHr: true };

  if (h.stillHere) {
    if (h.tenureDays < 365) return { category: "TOO_SOON", why: "Hired less than 12 months ago", byHr: false };
    return yearOneVerdict(h, "Stayed a year");
  }

  if (h.left365 === null && h.rosterExit) return { category: "NEEDS_CALL", why: "Last day is a year-end roster date, so year one can't be told", byHr: false };
  const firstYear = h.left365 === 1 || (h.left365 === null && h.tenureDays < 365);
  const reason = h.reason ?? "no reason on file";

  if (!firstYear) {
    if (h.voluntary === "I" && h.reason && PERSON_REASONS.has(h.reason)) {
      return { category: "NEEDS_CALL", why: `Let go after year one (${reason}): Satisfactory, Bad or Neutral`, byHr: false };
    }
    return yearOneVerdict(h, "Stayed a year");
  }

  if (h.voluntary === "I") {
    if (h.reason && PERSON_REASONS.has(h.reason)) return { category: "BAD", why: `Let go in year one: ${reason}`, byHr: false };
    if (h.reason && LAYOFF_REASONS.has(h.reason)) return { category: "NOT_COUNTED", why: `Let go in year one: ${reason}`, byHr: false };
    return { category: "NEEDS_CALL", why: `Let go in year one: ${reason}`, byHr: false };
  }
  if (h.voluntary === "V") {
    if (h.reason && NOT_COUNTED_QUITS.has(h.reason)) return { category: "NOT_COUNTED", why: `Quit in year one: ${reason}`, byHr: false };
    if (h.wouldHireBack === "YES") return { category: "REGRETTED", why: "Quit in year one; HR would hire them back", byHr: false };
    if (h.wouldHireBack === "NO") return { category: "BAD", why: "Quit in year one; HR would not hire them back", byHr: false };
    const last = [...h.checkins].filter((c) => c.wouldHireAgain !== null).sort((a, b) => b.dayMark - a.dayMark)[0];
    if (last?.wouldHireAgain === true) return { category: "REGRETTED", why: `Quit in year one; ${last.dayMark}-day check-in said would hire again`, byHr: false };
    if (last?.wouldHireAgain === false) return { category: "BAD", why: `Quit in year one; ${last.dayMark}-day check-in said would not hire again`, byHr: false };
    return { category: "NEEDS_CALL", why: "Quit in year one: would you hire them back?", byHr: false };
  }
  return { category: "NEEDS_CALL", why: "Left in year one with no quit or let-go on file", byHr: false };
}
