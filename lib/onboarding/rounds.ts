// Second (and third, and ...) trips through onboarding.
//
// Most people are onboarded once. Two cases need it done again:
//
//   * a REHIRE — a former employee comes back, and everything (background check,
//     drug screen, Paycom, orientation) is genuinely new;
//   * an internal move big enough to count as a new start — base support in
//     maintenance to a PDP seat in flight ops is a different department, a
//     different supervisor, a different offer letter and a different set of
//     required documents.
//
// Not every promotion needs this. It is deliberately a decision someone makes,
// not something the app infers from a title change.
//
// This module is the pure half — the reasons, the defaults for what carries over,
// and the labels. The database work lives in lib/data/onboarding-rounds.ts, so a
// client component can import from here without pulling in Prisma.

export const ROUND_REASONS = [
  {
    key: "DEPARTMENT_CHANGE",
    label: "Department change",
    blurb: "Moving to a different department. Treated like a new start — almost everything is done again."
  },
  {
    key: "ROLE_CHANGE",
    label: "Role change within the department",
    blurb: "New role, same department. The offer paperwork and Paycom are redone; the rest carries over."
  },
  {
    key: "REHIRE",
    label: "Rehire",
    blurb: "A former employee coming back. Everything is done fresh, and a new employment period is opened."
  },
  {
    key: "OTHER",
    label: "Other",
    blurb: "Something else that needs the checklist run again. Nothing is assumed — every item starts open."
  }
] as const;

export type RoundReason = (typeof ROUND_REASONS)[number]["key"];

export const ROUND_REASON_KEYS = ROUND_REASONS.map((r) => r.key) as readonly RoundReason[];

export function isRoundReason(value: unknown): value is RoundReason {
  return typeof value === "string" && (ROUND_REASON_KEYS as readonly string[]).includes(value);
}

export function roundReasonLabel(key: string): string {
  return ROUND_REASONS.find((r) => r.key === key)?.label ?? key;
}

// Which checklist items start the new round already ticked, because they really
// were done and doing them again would be busywork.
//
// These are DEFAULTS ONLY — the dialog shows every item and the operator decides.
// They lean conservative on purpose: leaving a compliance item open costs one
// click, pre-ticking one that actually needed redoing means it silently never
// happens. So a background check and a drug screen only carry over for a move
// inside the same department, and never for a rehire.
export const CARRY_OVER_DEFAULTS: Record<RoundReason, string[]> = {
  DEPARTMENT_CHANGE: ["company_gmail"],
  ROLE_CHANGE: [
    "company_gmail",
    "groups_drive",
    "bg_check_start",
    "bg_check_info",
    "bg_check_complete",
    "drug_screen",
    "attended_orientation"
  ],
  REHIRE: [],
  OTHER: []
};

/** A frozen OnboardingTask row, as stored in OnboardingArchive.tasksJson. */
export type ArchivedTask = {
  key: string;
  label: string;
  group: string;
  order: number;
  status: string;
  completedAt: string | null;
};

export function parseArchivedTasks(json: string): ArchivedTask[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is ArchivedTask => Boolean(t) && typeof t.key === "string");
  } catch {
    return [];
  }
}
