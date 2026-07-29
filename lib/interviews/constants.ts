// Interview write-up options. Stored as Strings (repo convention — no Prisma
// enums), with these as the single source of truth for label and colour.

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

export const INTERVIEW_TYPES = [
  { value: "RECRUITER_SCREEN", label: "Recruiter screen" },
  { value: "HIRING_MANAGER", label: "Hiring manager" },
  { value: "PANEL", label: "Panel" },
  { value: "FINAL", label: "Final" },
  { value: "OTHER", label: "Other" }
] as const;
