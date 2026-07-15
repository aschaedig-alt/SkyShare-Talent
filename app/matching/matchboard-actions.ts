"use server";

import { getRoleScreening, getCandidateRoleMatches } from "@/lib/matching/matchboard";
import type { JobScreeningData } from "@/lib/data/job-screening";
import type { CandidateRoleMatches } from "@/lib/matching/matchboard";

// Read-only fetch of the selected subject's screening/matches, so the Matchboard
// can switch selections client-side (instant highlight + spinner) instead of a
// full page navigation. Mirrors what the page's server render computes.
export async function loadMatchboardDetail(
  mode: "role" | "candidate",
  id: string
): Promise<{ roleData: JobScreeningData | null; candidateData: CandidateRoleMatches | null }> {
  if (!id) return { roleData: null, candidateData: null };
  if (mode === "role") {
    return { roleData: await getRoleScreening(id), candidateData: null };
  }
  return { roleData: null, candidateData: await getCandidateRoleMatches(id) };
}
