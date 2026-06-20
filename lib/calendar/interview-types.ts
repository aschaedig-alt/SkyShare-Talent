/**
 * Interview stages/types with visual color mapping.
 * Each type maps to:
 *  - an in-app color (Tailwind classes)
 *  - a Google Calendar colorId (1-11) so the stage is visually distinct in Google too
 *
 * Google Calendar event colorIds:
 *  1 Lavender, 2 Sage, 3 Grape, 4 Flamingo, 5 Banana,
 *  6 Tangerine, 7 Peacock, 8 Graphite, 9 Blueberry, 10 Basil, 11 Tomato
 */

export const interviewTypes = [
  "RECRUITER_SCREEN",
  "HIRING_MANAGER",
  "TECHNICAL",
  "PANEL",
  "FINAL",
  "OFFER",
  "OTHER"
] as const;

export type InterviewType = (typeof interviewTypes)[number];

export type InterviewTypeMeta = {
  value: InterviewType;
  label: string;
  shortLabel: string;
  googleColorId: string;
  /** Solid chip background + text */
  chip: string;
  /** Dot/legend swatch */
  dot: string;
  /** Left accent border */
  accent: string;
};

export const INTERVIEW_TYPE_META: Record<InterviewType, InterviewTypeMeta> = {
  RECRUITER_SCREEN: {
    value: "RECRUITER_SCREEN",
    label: "Recruiter Screen",
    shortLabel: "Screen",
    googleColorId: "7", // Peacock (blue)
    chip: "bg-blue-500 text-white hover:bg-blue-600",
    dot: "bg-blue-500",
    accent: "border-l-blue-500"
  },
  HIRING_MANAGER: {
    value: "HIRING_MANAGER",
    label: "Hiring Team",
    shortLabel: "Hiring Team",
    googleColorId: "3", // Grape (purple)
    chip: "bg-purple-500 text-white hover:bg-purple-600",
    dot: "bg-purple-500",
    accent: "border-l-purple-500"
  },
  TECHNICAL: {
    value: "TECHNICAL",
    label: "Technical / Sim",
    shortLabel: "Technical",
    googleColorId: "6", // Tangerine (orange)
    chip: "bg-orange-500 text-white hover:bg-orange-600",
    dot: "bg-orange-500",
    accent: "border-l-orange-500"
  },
  PANEL: {
    value: "PANEL",
    label: "Panel",
    shortLabel: "Panel",
    googleColorId: "10", // Basil (green)
    chip: "bg-emerald-500 text-white hover:bg-emerald-600",
    dot: "bg-emerald-500",
    accent: "border-l-emerald-500"
  },
  FINAL: {
    value: "FINAL",
    label: "Final",
    shortLabel: "Final",
    googleColorId: "11", // Tomato (red)
    chip: "bg-red-500 text-white hover:bg-red-600",
    dot: "bg-red-500",
    accent: "border-l-red-500"
  },
  OFFER: {
    value: "OFFER",
    label: "Offer",
    shortLabel: "Offer",
    googleColorId: "5", // Banana (yellow)
    chip: "bg-amber-400 text-brand-black hover:bg-amber-500",
    dot: "bg-amber-400",
    accent: "border-l-amber-400"
  },
  OTHER: {
    value: "OTHER",
    label: "Other",
    shortLabel: "Other",
    googleColorId: "8", // Graphite (gray)
    chip: "bg-slate-500 text-white hover:bg-slate-600",
    dot: "bg-slate-500",
    accent: "border-l-slate-500"
  }
};

export const DEFAULT_INTERVIEW_TYPE: InterviewType = "RECRUITER_SCREEN";

export function interviewTypeMeta(value: string | null | undefined): InterviewTypeMeta {
  if (value && value in INTERVIEW_TYPE_META) {
    return INTERVIEW_TYPE_META[value as InterviewType];
  }
  return INTERVIEW_TYPE_META[DEFAULT_INTERVIEW_TYPE];
}

export function isInterviewType(value: string | null | undefined): value is InterviewType {
  return !!value && interviewTypes.includes(value as InterviewType);
}
