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
 * Anyone who cannot be derived (no application at all, or a job whose department
 * was never filled in) resolves to "unassigned" — the honest answer, and the
 * group a manual override is meant to target.
 *
 * That group was worked through on Aug 6: 305 LIVE candidates were reviewed and
 * given an override (297 flight-ops, 8 maintenance), so no live candidate reads
 * as unassigned today. Archived Jazz records were deliberately left alone.
 * Derivation is still the primary path — the override exists for people no
 * application can place, not as a backfill of what a join already knows.
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
 * This is now a straight pass-through of resolveDepartmentKey. It briefly was
 * not, and the exception is worth recording so nobody re-adds it:
 *
 *   "Operations" used to be forced to Sky Ops here, on the reasoning that
 *   SkyShare's Sky Ops is the dispatch/scheduling function and "Operations" was
 *   the only ambiguous value in the job table. That was a guess about a WORD.
 *   The word turned out to be exactly one job — Corporate Cabin Attendant
 *   (RETIRED, 284 applicants) — and the same file already read that job's TITLE
 *   as flight-ops, so the module disagreed with itself. The user settled it on
 *   Aug 6: pilots and cabin attendants are both Flight Ops. Fixed at source by
 *   setting that job's department to "Flight Operations", a value 4 other jobs
 *   already use, so no string in the job table is ambiguous any more and the
 *   special case had nothing left to match.
 *
 *   Do not restore it. A future bare "Operations" should land in Other and be
 *   looked at, not be silently coloured by a mapping that was wrong once.
 */
export function candidateDepartmentFromRaw(raw: string | null | undefined): CandidateDepartmentKey {
  const value = (raw ?? "").trim();
  if (!value) return "unassigned";

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
 * A candidate's departments, with a hand-set override winning outright.
 *
 * The override is the ONLY stored department (Candidate.departmentOverride);
 * everything else is derived at read time. An unrecognised stored value is
 * ignored rather than shown, so a bad hand-edit degrades to the derived answer
 * instead of putting a person in a department that does not exist.
 */
export function resolveCandidateDepartments(
  override: string | null | undefined,
  rawJobDepartments: Array<string | null | undefined>
): CandidateDepartmentKey[] {
  if (override && isCandidateDepartmentKey(override)) return [override];
  return candidateDepartmentsFrom(rawJobDepartments);
}

/** Where a proposed department came from, so the screen can show its reasoning. */
export type DepartmentBasis =
  | "job-title"
  | "pilot-application"
  | "source"
  | "current-title"
  | "none";

export type DepartmentProposal = {
  key: CandidateDepartmentKey | null;
  basis: DepartmentBasis;
  /** Human-readable evidence, shown next to the proposal so it can be judged. */
  evidence: string | null;
};

/**
 * "FILLED - " is a pipeline artifact meaning the REQ was filled; it says nothing
 * about the person and would otherwise block the title from resolving.
 * (getCandidateProfileData has its own copy for display; this one is for matching.)
 */
function stripFilledPrefix(title: string | null): string | null {
  if (!title) return null;
  return title.replace(/^\s*FILLED\s*-\s*/i, "").trim() || null;
}

/**
 * Propose a department for somebody no application can place.
 *
 * ONLY for the review screen — nothing here writes itself anywhere. Each rule is
 * a STRUCTURED field, never resume prose, and that is deliberate: a keyword scan
 * of extractedText looked like it classified 269 of 271 perfectly, and was in
 * fact matching the blank form labels of the Adobe Sign pilot application
 * template ("TOTAL FLIGHT TIME:", "TOTAL SIC TIME:"). Right answer, no reasoning
 * — it would have called a mechanic a pilot the moment one filled in that form.
 * documentType gives the same answer as a fact.
 *
 * Measured over the 305 live candidates with no department: document 268,
 * source 12, current title 20, leaving 5 for a person.
 */
export function proposeDepartment(input: {
  jobTitles: Array<string | null | undefined>;
  hasPilotApplication: boolean;
  source: string | null;
  currentTitle: string | null;
}): DepartmentProposal {
  // A job title is the strongest of these — it is the role they applied to,
  // just on a job whose department was never filled in.
  for (const title of input.jobTitles) {
    if (!title) continue;
    const key = candidateDepartmentFromRaw(title);
    if (key !== "unassigned" && key !== "other") {
      return { key, basis: "job-title", evidence: `Applied to "${title}"` };
    }
  }

  // You do not fill out a pilot application unless you are applying to fly.
  if (input.hasPilotApplication) {
    return { key: "flight-ops", basis: "pilot-application", evidence: "Has a signed Pilot Application on file" };
  }

  const source = input.source ?? "";
  if (/pilot application/i.test(source) || /PIC applicants|captain applicants/i.test(source)) {
    return { key: "flight-ops", basis: "source", evidence: `Came in via "${source}"` };
  }

  const title = stripFilledPrefix(input.currentTitle);
  if (title) {
    const key = candidateDepartmentFromRaw(title);
    if (key !== "unassigned" && key !== "other") {
      return { key, basis: "current-title", evidence: `Current title "${title}"` };
    }
    return { key: null, basis: "none", evidence: `Current title "${title}" does not map to a department` };
  }

  return { key: null, basis: "none", evidence: null };
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
