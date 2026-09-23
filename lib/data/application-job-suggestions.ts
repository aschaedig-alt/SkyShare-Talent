import { prisma } from "@/lib/prisma";
import { suggestJobsForTitle, type JobSuggestion } from "@/lib/jobs/paycom-title-match";

/**
 * Suggested jobs for each of a candidate's UNLINKED applications, keyed by
 * application id — what the Applied to tab offers as one-click links.
 *
 * Every job is read once per page (about 130 rows), because the matcher needs the
 * whole list to know whether a title names ONE job or several; a per-application
 * query could not tell "the only Challenger 350 Captain job" from "the first one".
 */
export async function getUnlinkedJobSuggestions(candidateId: string): Promise<Record<string, JobSuggestion[]>> {
  const unlinked = await prisma.candidateApplication.findMany({
    where: { candidateId, jobId: null, historicalJobTitle: { not: null } },
    select: { id: true, historicalJobTitle: true }
  });
  if (unlinked.length === 0) return {};

  const jobs = await prisma.job.findMany({
    select: { id: true, title: true, status: true, mergedIntoJobId: true, city: true, state: true }
  });
  const out: Record<string, JobSuggestion[]> = {};
  for (const a of unlinked) {
    out[a.id] = suggestJobsForTitle(a.historicalJobTitle as string, jobs);
  }
  return out;
}
