/**
 * The candidate STATUS list — the record-level state shown in the profile's
 * header pill and the Status picker. Not the pipeline STAGE (lib/candidates/
 * stages.ts), which says where they got to; status says what they are now.
 *
 * Asked for on 2026-11-11 (feedback cmwclwrfp): "lets add the status Hired to the
 * status list... is there a better status thats appropriate to being hired instead
 * of inactive/archived? something that clearly shows its a hired status?"
 *
 * Before this the list was Active / Inactive / Archived, so somebody who took the
 * job read as either still in play or written off. Two statuses were added:
 *
 *   CURRENT_EMPLOYEE  they work here (onboarding, current, or on contract)
 *   FORMER_EMPLOYEE   they worked here and left
 *
 * Named "Current employee", not "Hired", by his call the same day: it pairs with
 * Former employee, and "Hired" is already the STAGE (the pipeline outcome), so the
 * status and the stage no longer say the same word for two different things.
 *
 * Both are set AUTOMATICALLY from the linked hire (lib/candidates/hire-lifecycle.ts)
 * and can still be picked by hand.
 *
 * Neither is a recruiting status. A hired person is held out of requirement scans
 * by the existing skip list (scanExcludedReason HIRED), which the lifecycle sync
 * sets — not by this value — so the "Include skipped" escape hatch still works.
 *
 * ARCHIVED keeps its one existing meaning: a historical JazzHR import. MERGED is a
 * tombstone and is never offered in the picker.
 *
 * PURE module (no Prisma) so client components can import it.
 */

export const CANDIDATE_STATUS = {
  ACTIVE: "ACTIVE",
  CURRENT_EMPLOYEE: "CURRENT_EMPLOYEE",
  FORMER_EMPLOYEE: "FORMER_EMPLOYEE",
  INACTIVE: "INACTIVE",
  ARCHIVED: "ARCHIVED",
  MERGED: "MERGED"
} as const;

export type CandidateStatus = (typeof CANDIDATE_STATUS)[keyof typeof CANDIDATE_STATUS];

/** Picker order. MERGED is deliberately absent: nobody should pick it by hand. */
export const CANDIDATE_STATUS_OPTIONS: Array<{ value: CandidateStatus; label: string }> = [
  { value: "ACTIVE", label: "Active" },
  { value: "CURRENT_EMPLOYEE", label: "Current employee" },
  { value: "FORMER_EMPLOYEE", label: "Former employee" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "ARCHIVED", label: "Archived" }
];

const LABELS: Record<string, string> = {
  ...Object.fromEntries(CANDIDATE_STATUS_OPTIONS.map((o) => [o.value, o.label])),
  MERGED: "Merged"
};

/** Readable label; an unknown stored value is shown as-is rather than hidden. */
export function candidateStatusLabel(status: string | null | undefined): string {
  if (!status) return "";
  return LABELS[status] ?? status;
}

/** The statuses that mean "this person was hired by us", current or former. */
export function isEmployeeStatus(status: string | null | undefined): boolean {
  return status === CANDIDATE_STATUS.CURRENT_EMPLOYEE || status === CANDIDATE_STATUS.FORMER_EMPLOYEE;
}

/**
 * Pill classes for the profile header. Current employee gets its own solid green so it does
 * not read as the pale "Active" green; Former employee is the neutral grey with a
 * navy ring so it is visibly not the same thing as Inactive.
 */
export function candidateStatusPillClass(status: string | null | undefined): string {
  switch (status) {
    case CANDIDATE_STATUS.ACTIVE:
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300";
    case CANDIDATE_STATUS.CURRENT_EMPLOYEE:
      return "bg-emerald-600 text-white dark:bg-emerald-500/80 dark:text-white";
    case CANDIDATE_STATUS.FORMER_EMPLOYEE:
      return "bg-brand-cloudDancer text-brand-lea ring-1 ring-brand-lea/30 dark:bg-white/5 dark:text-slate-200 dark:ring-white/20";
    default:
      return "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400";
  }
}
