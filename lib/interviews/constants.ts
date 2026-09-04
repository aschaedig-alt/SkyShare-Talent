// Interview write-up options. Stored as Strings (repo convention — no Prisma
// enums), with these as the single source of truth for label and colour.
//
// EXCEPT the type list, which belongs to lib/calendar/interview-types.ts and is
// re-exported below. Keeping a second copy here is what lost TECHNICAL.

import { interviewTypes, INTERVIEW_TYPE_META } from "@/lib/calendar/interview-types";

export const INTERVIEW_OUTCOMES = [
  { value: "PASS", label: "Pass", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" },
  { value: "MAYBE", label: "Maybe", tone: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
  { value: "FAIL", label: "No", tone: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" }
] as const;

export function interviewOutcomeLabel(value: string | null): string | null {
  return INTERVIEW_OUTCOMES.find((o) => o.value === value)?.label ?? null;
}

export function interviewOutcomeTone(value: string | null): string {
  return INTERVIEW_OUTCOMES.find((o) => o.value === value)?.tone ?? "bg-brand-cloudDancer text-brand-grey dark:bg-white/10 dark:text-slate-300";
}

/** The windows the Recent interviews filter offers. */
export const RECENT_INTERVIEW_WINDOWS = [30, 60, 90] as const;
export type RecentInterviewWindow = (typeof RECENT_INTERVIEW_WINDOWS)[number];

/**
 * The write-up form's type dropdown — and the PATCH route's validator.
 *
 * DERIVED, not written out. This was a second hand-maintained copy of the
 * calendar's list and it had silently fallen two entries behind (no TECHNICAL,
 * no OFFER), so the only way to record a technical interview was to schedule
 * one on the calendar, and editing that write-up afterwards rejected its own
 * type. Adding a stage in lib/calendar/interview-types.ts is now enough.
 */
export const INTERVIEW_TYPES = interviewTypes.map((value) => ({
  value,
  label: INTERVIEW_TYPE_META[value].label
}));
