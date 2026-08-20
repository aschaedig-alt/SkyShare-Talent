"use server";

import { getJobScreening } from "@/lib/data/job-screening";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { isCandidateAllowlisted } from "@/lib/auth/candidate-scope";
import type { JobScreeningData } from "@/lib/data/job-screening";

// Load a job's screening/candidate-fit on demand, so the Jobs page can show it for
// whichever job is selected without scanning every job up front on page load.
//
// It had no auth check of its own, and a server action is a POST to the PAGE
// path, so it ran behind neither requireModulePageAccess nor the API permission
// gate — scored applicant lists for any job id were readable by anyone who could
// reach the endpoint. requireApiPermission is the same helper every API read
// uses, and it honours the local-dev bypass.
//
// A refusal answers with getJobScreening(null) — the module's OWN empty result —
// so it is shaped exactly like a job with nothing to screen and the caller
// cannot tell the two apart.
export async function loadJobScreening(jobId: string): Promise<JobScreeningData> {
  const auth = await requireApiPermission("candidates:read");
  if (!auth.ok) return getJobScreening(null);

  // Screening is a whole-pool ranked scan (the best matches in the system, plus
  // the size of the pool they came from) alongside the job's applicants. Scoping
  // it means scoring only the allowlisted viewer's own people, which cannot be
  // done from here without re-deriving getJobScreening; filtering the finished
  // ranking instead would still leak pool size and relative position. So it is
  // refused for an allowlist-scoped viewer and untouched for everyone else.
  if (isCandidateAllowlisted(auth.user.viewer)) return getJobScreening(null);

  return getJobScreening(jobId);
}
