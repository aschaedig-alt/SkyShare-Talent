"use server";

import { getRoleScreening, getCandidateRoleMatches } from "@/lib/matching/matchboard";
import { getSkippedPool, type SkippedCandidate } from "@/lib/candidates/skipped-pool";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { isCandidateAllowlisted, isCandidateVisible } from "@/lib/auth/candidate-scope";
import type { ViewerScope } from "@/lib/auth/viewer-scope";
import type { JobScreeningData } from "@/lib/data/job-screening";
import type { CandidateRoleMatches } from "@/lib/matching/matchboard";

/**
 * The gate these actions never had.
 *
 * A server action is a POST to the PAGE path, so neither requireModulePageAccess
 * (which gates pages) nor requireApiPermission (which gates route handlers) has
 * ever run on one — both actions below answered candidate names, titles, stages
 * and exclusion notes for an arbitrary id to anyone who could reach the
 * endpoint. requireApiPermission is the same helper every API read already uses,
 * it hands back the caller's resolved scope, and it honours the local-dev bypass
 * (viewer null, which every scope helper reads as unrestricted).
 */
async function readAccess(): Promise<{ ok: true; viewer: ViewerScope | null } | { ok: false }> {
  const auth = await requireApiPermission("candidates:read");
  if (!auth.ok) return { ok: false };
  return { ok: true, viewer: auth.user.viewer };
}

// Read-only fetch of the selected subject's screening/matches, so the Matchboard
// can switch selections client-side (instant highlight + spinner) instead of a
// full page navigation. Mirrors what the page's server render computes.
export async function loadMatchboardDetail(
  mode: "role" | "candidate",
  id: string
): Promise<{ roleData: JobScreeningData | null; candidateData: CandidateRoleMatches | null }> {
  if (!id) return { roleData: null, candidateData: null };

  // Fails closed, and to the SAME answer a missing record gives. A caller who is
  // not allowed the record must not be able to tell "does not exist" from "not
  // yours" — the existence of the person is the fact being hidden.
  const access = await readAccess();
  if (!access.ok) return { roleData: null, candidateData: null };

  if (mode === "role") {
    // A role screening is a whole-pool ranked scan: the best matches in the
    // system plus the size of the pool they were drawn from. Scoping it means
    // scoring only the allowlisted viewer's own people, which cannot be done
    // from here without re-deriving getRoleScreening; filtering the finished
    // ranking instead would still leak pool size and relative position. So it is
    // refused for an allowlist-scoped viewer and untouched for everyone else.
    if (isCandidateAllowlisted(access.viewer)) return { roleData: null, candidateData: null };
    return { roleData: await getRoleScreening(id), candidateData: null };
  }

  if (!isCandidateVisible(access.viewer, id)) return { roleData: null, candidateData: null };

  const candidateData = await getCandidateRoleMatches(id);
  if (!candidateData || !isCandidateAllowlisted(access.viewer)) {
    return { roleData: null, candidateData };
  }

  // priorSkips are OTHER candidate records that look like the same human. As far
  // as the allowlist is concerned they are separate people, so a viewer granted
  // one record does not get the earlier ones along with it.
  return {
    roleData: null,
    candidateData: {
      ...candidateData,
      priorSkips: candidateData.priorSkips.filter((skip) => isCandidateVisible(access.viewer, skip.candidateId))
    }
  };
}

// Read-only. The skip list is loaded on demand rather than with every Matchboard
// render, because most visits never open it.
export async function loadSkippedPool(): Promise<{ ok: boolean; data?: SkippedCandidate[]; error?: string }> {
  const access = await readAccess();
  if (!access.ok) return { ok: false, error: "Could not load the skipped list." };

  try {
    const rows = await getSkippedPool();
    if (!isCandidateAllowlisted(access.viewer)) return { ok: true, data: rows };

    // Unlike the scans above this is a flat list — no ranking and no count
    // computed over the people being removed — so narrowing it after the fact
    // leaks nothing. The re-application hits are separate candidate records and
    // are narrowed too.
    return {
      ok: true,
      data: rows
        .filter((row) => isCandidateVisible(access.viewer, row.candidateId))
        .map((row) => ({
          ...row,
          reapplied: row.reapplied.filter((hit) => isCandidateVisible(access.viewer, hit.candidateId))
        }))
    };
  } catch {
    return { ok: false, error: "Could not load the skipped list." };
  }
}
