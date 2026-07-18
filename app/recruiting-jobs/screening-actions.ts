"use server";

import { getJobScreening } from "@/lib/data/job-screening";
import type { JobScreeningData } from "@/lib/data/job-screening";

// Load a job's screening/candidate-fit on demand, so the Jobs page can show it for
// whichever job is selected without scanning every job up front on page load.
export async function loadJobScreening(jobId: string): Promise<JobScreeningData> {
  return getJobScreening(jobId);
}
