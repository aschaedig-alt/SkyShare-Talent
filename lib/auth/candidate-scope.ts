import type { ViewerScope } from "@/lib/auth/viewer-scope";

// Accepts a full ViewerScope OR any narrower object carrying the same three
// fields. lib/data/candidates.ts threads a Pick<> of ViewerScope through its list
// query rather than the whole object, and this keeps both callers honest without
// either having to widen.
export type CandidateAccessScope = Pick<
  ViewerScope,
  "restrictCandidatesToAllowlist" | "allowedCandidateIds"
> &
  Partial<Pick<ViewerScope, "allowlistCanAnnotate">>;

// ONE definition of "which candidates may this viewer see". Every candidate
// query imports from here rather than re-deriving the rule from ViewerScope's
// fields, because this repo has already shipped a wrong filter half-fixed three
// times in two days — the fix for that is a named predicate with one home.
//
// The department restriction (restrictCandidatesToDepartment) is a DIFFERENT
// mechanism and still lives in lib/data/candidates.ts, because it is expressed
// as a join through applications->job->department rather than as a set of ids.
// Where both are on, the allowlist WINS: it is the stricter, hand-made
// statement, and intersecting them would silently produce an empty list with no
// explanation. The admin UI greys out the department control while the
// allowlist is on so the two cannot be set in contradiction.

/** Is this viewer narrowed to a hand-picked set of candidates? */
export function isCandidateAllowlisted(viewer: CandidateAccessScope | null | undefined): boolean {
  return Boolean(viewer?.restrictCandidatesToAllowlist);
}

/**
 * A Prisma where-fragment narrowing a Candidate query to what this viewer may
 * see, or null when they are not allowlist-scoped.
 *
 * Returns null — NOT {} — for the unrestricted case, so a caller has to make a
 * visible decision about it (spread it, or branch) rather than accidentally
 * ANDing an empty object and believing it filtered something.
 */
export function candidateScopeWhere(viewer: CandidateAccessScope | null | undefined): { id: { in: string[] } } | null {
  if (!isCandidateAllowlisted(viewer)) {
    return null;
  }
  // allowedCandidateIds is guaranteed non-null when the flag is on
  // (resolveViewerScope enforces that); ?? [] keeps this total anyway, and an
  // empty `in` correctly matches nobody.
  return { id: { in: viewer?.allowedCandidateIds ?? [] } };
}

/**
 * Same thing keyed on a foreign key column instead of the primary key, for
 * tables that reference a candidate (files, interviews, notes, trips).
 * Pass the column name — "candidateId" in almost every case.
 */
export function candidateFieldScopeWhere(
  viewer: CandidateAccessScope | null | undefined,
  field = "candidateId"
): Record<string, { in: string[] }> | null {
  if (!isCandidateAllowlisted(viewer)) {
    return null;
  }
  return { [field]: { in: viewer?.allowedCandidateIds ?? [] } };
}

/**
 * May this viewer see this one candidate?
 *
 * A null/undefined candidateId means the row is not attached to a candidate at
 * all (an unassigned intake file, an unmatched calendar event). That is NOT
 * visible to an allowlisted viewer: they were granted named people, and an
 * unattached record is by definition not one of them.
 */
export function isCandidateVisible(
  viewer: CandidateAccessScope | null | undefined,
  candidateId: string | null | undefined
): boolean {
  if (!isCandidateAllowlisted(viewer)) {
    return true;
  }
  if (!candidateId) {
    return false;
  }
  return (viewer?.allowedCandidateIds ?? []).includes(candidateId);
}

/**
 * Narrow a caller-supplied list of ids to what this viewer may see.
 *
 * Callers should report the delta rather than silently shrinking: a saved view
 * somebody was told holds twelve people should not quietly render three with no
 * explanation. See app/candidates/views/[id]/page.tsx for the pattern.
 */
export function scopeCandidateIds(viewer: CandidateAccessScope | null | undefined, ids: string[]): string[] {
  if (!isCandidateAllowlisted(viewer)) {
    return ids;
  }
  const allowed = new Set(viewer?.allowedCandidateIds ?? []);
  return ids.filter((id) => allowed.has(id));
}

/**
 * May this viewer write a note or an interview scorecard on this candidate?
 *
 * This is the ONE write path an allowlisted viewer gets. It is deliberately
 * narrow: it does not imply candidates:write, and it never covers editing the
 * candidate record, tags, files, or stage. It exists so a hiring manager brought
 * in for a specific search can record what they thought of the people they
 * interviewed, which is the entire point of giving them access.
 *
 * Anyone holding candidates:write through their role is unaffected and should
 * not be routed through here — check the permission first, then fall back to
 * this. See app/api/candidates/[id]/notes/route.ts.
 */
export function canAnnotateCandidate(
  viewer: CandidateAccessScope | null | undefined,
  candidateId: string | null | undefined
): boolean {
  if (!viewer?.restrictCandidatesToAllowlist || !viewer.allowlistCanAnnotate) {
    return false;
  }
  return isCandidateVisible(viewer, candidateId);
}

/**
 * Merge the allowlist into an existing where-clause's AND array.
 *
 * Prefer this over spreading the fragment as a top-level key on a where object
 * that other code also builds. lib/data/candidates.ts records, in a comment
 * earned the hard way, that assigning a top-level key there has already silently
 * dropped a search predicate once. Appending to AND cannot do that.
 */
export function withCandidateScope(
  viewer: CandidateAccessScope | null | undefined,
  where: Record<string, unknown>
): Record<string, unknown> {
  const scope = candidateScopeWhere(viewer);
  if (!scope) {
    return where;
  }
  return {
    ...where,
    AND: [...((where.AND as unknown[]) ?? []), scope]
  };
}
