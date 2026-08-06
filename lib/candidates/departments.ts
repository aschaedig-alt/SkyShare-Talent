import { resolveDepartmentKey } from "@/lib/calendar/departments";

/**
 * A candidate's department, DERIVED from the job they applied to.
 *
 * There is deliberately no Candidate.department column. 3,167 of 3,598
 * candidates already reach a job that carries a department, so storing a copy
 * would mean a 3,598-row write against the SHARED LIVE database to reproduce
 * information that is already there — and it would then go stale the moment
 * somebody's application moved. Deriving it costs one join and is always right.
 *
 * The ~431 who cannot be derived (312 with no application at all, 119 whose job
 * has a null department) resolve to "unassigned". That is the honest answer, and
 * it is the group a manual override should target — a small, targeted write
 * rather than a mass backfill.
 *
 * These keys are the recruiter's vocabulary, which is FLATTER than the
 * calendar's org taxonomy in lib/calendar/departments.ts: there, Sky Ops and
 * Accounting are sub-groups of "support" and Flight Ops is "crew". This module
 * is the mapping between the two, so the two vocabularies cannot drift — the
 * calendar keeps its shape and recruiting gets the five names it actually uses.
 */
export type CandidateDepartmentKey =
  | "maintenance"
  | "flight-ops"
  | "sky-ops"
  | "accounting"
  | "fbo"
  | "other"
  | "unassigned";

export type CandidateDepartment = {
  key: CandidateDepartmentKey;
  label: string;
  /** Chip styling, matching the locked design system (4px corners, no pills). */
  chip: string;
};

export const CANDIDATE_DEPARTMENTS: CandidateDepartment[] = [
  { key: "maintenance", label: "Maintenance", chip: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300" },
  { key: "flight-ops", label: "Flight Ops", chip: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/15 dark:text-indigo-300" },
  { key: "sky-ops", label: "Sky Ops", chip: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300" },
  { key: "accounting", label: "Accounting", chip: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300" },
  { key: "fbo", label: "FBO", chip: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/15 dark:text-fuchsia-300" },
  { key: "other", label: "Other", chip: "border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300" },
  { key: "unassigned", label: "Unassigned", chip: "border-brand-lea/15 bg-brand-cloudDancer/60 text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400" }
];

export function isCandidateDepartmentKey(value: string): value is CandidateDepartmentKey {
  return CANDIDATE_DEPARTMENTS.some((d) => d.key === value);
}

export function candidateDepartmentLabel(key: CandidateDepartmentKey): string {
  return CANDIDATE_DEPARTMENTS.find((d) => d.key === key)?.label ?? "Unassigned";
}

/**
 * Map ONE raw Job.department string onto a recruiting department.
 *
 * Every rule that is not a straight pass-through of resolveDepartmentKey is
 * called out, because a silent reinterpretation of the org taxonomy is exactly
 * the kind of thing that later reads as a bug:
 *
 *   "Operations" -> Sky Ops. resolveDepartmentKey sends a bare "Operations" to
 *   support/other, since its skyops rule wants "sky ops"/"dispatch"/
 *   "scheduling"/"operations control". SkyShare's Sky Ops IS that function, and
 *   "Operations" is the only ambiguous value in the whole job table, so it is
 *   mapped here rather than by widening the calendar's regex — widening it would
 *   silently recolour the calendar too.
 */
export function candidateDepartmentFromRaw(raw: string | null | undefined): CandidateDepartmentKey {
  const value = (raw ?? "").trim();
  if (!value) return "unassigned";

  if (/^operations$/i.test(value)) return "sky-ops";

  const { deptKey, subKey } = resolveDepartmentKey(value);
  if (deptKey === "maintenance") return "maintenance";
  if (deptKey === "fbo") return "fbo";
  if (deptKey === "crew") return "flight-ops";
  if (deptKey === "support") {
    if (subKey === "skyops") return "sky-ops";
    if (subKey === "accounting") return "accounting";
    return "other";
  }
  return "unassigned";
}

/**
 * A candidate's department from every job they have applied to.
 *
 * Somebody who applied to more than one department genuinely has more than one,
 * so this returns all of them rather than picking a winner — about 9 candidates
 * span departments and quietly collapsing them would hide a real applicant from
 * a filter they belong in. Ordered by CANDIDATE_DEPARTMENTS so display is stable.
 */
export function candidateDepartmentsFrom(rawDepartments: Array<string | null | undefined>): CandidateDepartmentKey[] {
  const keys = new Set<CandidateDepartmentKey>();
  for (const raw of rawDepartments) {
    if (raw && raw.trim()) keys.add(candidateDepartmentFromRaw(raw));
  }
  if (keys.size === 0) return ["unassigned"];
  return CANDIDATE_DEPARTMENTS.filter((d) => keys.has(d.key)).map((d) => d.key);
}

/**
 * The raw Job.department strings that bucket into the given recruiting
 * departments — so the filter runs in the DATABASE.
 *
 * Prisma cannot run the regex classifier in SQL, so resolve the raw strings
 * first and then filter on "applied to a job whose department is one of these".
 * Same technique as the existing hiring-manager department scope; kept in one
 * place so the two cannot disagree.
 */
export async function rawJobDepartmentsFor(
  keys: CandidateDepartmentKey[],
  allRawDepartments: Array<string | null>
): Promise<string[]> {
  const wanted = new Set(keys);
  return allRawDepartments
    .filter((d): d is string => Boolean(d))
    .filter((d) => wanted.has(candidateDepartmentFromRaw(d)));
}
