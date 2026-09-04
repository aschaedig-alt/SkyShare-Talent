/**
 * Interview stages/types with visual color mapping. Each type maps to:
 *  - an in-app color (Tailwind classes)
 *  - a Google Calendar colorId (1-11) so the stage is visually distinct in Google too
 *
 * Google Calendar event colorIds:
 *  1 Lavender, 2 Sage, 3 Grape, 4 Flamingo, 5 Banana,
 *  6 Tangerine, 7 Peacock, 8 Graphite, 9 Blueberry, 10 Basil, 11 Tomato
 *
 * THIS IS THE ONLY LIST. lib/interviews/constants.ts re-exports it for the
 * write-up form, and lib/validation/interview.ts builds its zod enum from it, so
 * a stage added here is immediately selectable, savable and valid everywhere.
 * Those used to be separate hand-written copies and they drifted: the write-up
 * one was missing TECHNICAL and OFFER entirely, so an interview scheduled as
 * Technical on the calendar could not be saved as Technical from the profile —
 * the PATCH route validated against the short list and silently dropped it.
 */

export const interviewTypes = [
  "RECRUITER_SCREEN",
  "HIRING_MANAGER",
  "SIM_EVAL",
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
  // The sim ride, split out of TECHNICAL — which used to be labelled
  // "Technical / Sim" and so had to stand for both. They are different events
  // run by different people on different days, and a pilot pipeline lives or
  // dies on the sim, so it gets to be its own stage rather than a footnote in
  // someone else's label. Rows already stored as TECHNICAL are untouched and
  // still valid; this only adds a type alongside them.
  SIM_EVAL: {
    value: "SIM_EVAL",
    label: "SIM Eval",
    shortLabel: "SIM",
    googleColorId: "4", // Flamingo (pink) — the most distinct colorId left
    chip: "bg-pink-500 text-white hover:bg-pink-600",
    dot: "bg-pink-500",
    accent: "border-l-pink-500"
  },
  TECHNICAL: {
    value: "TECHNICAL",
    label: "Technical",
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
