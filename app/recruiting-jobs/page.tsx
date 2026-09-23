import { redirect } from "next/navigation";
import { RecruitingJobsList } from "@/components/recruiting-jobs/RecruitingJobsList";
import { getRecruitingJobsData } from "@/lib/data/recruiting-jobs";
import { getNoJobRequirements, type NoJobRequirement } from "@/lib/data/pilot-requirements";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { hasPermission } from "@/lib/auth/roles";

// The same kind of match the job search makes (a substring of the joined
// fields), over what a requirement with no job has instead of a job's fields.
function requirementMatches(requirement: NoJobRequirement, query: string) {
  if (!query) return true;
  return [requirement.title, requirement.status, requirement.pilotSeat, requirement.operatorType, ...requirement.aircraftTypes, ...requirement.tails]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(query.toLowerCase());
}

type RecruitingJobsPageProps = {
  searchParams?: Promise<{ q?: string; id?: string }>;
};

export default async function RecruitingJobsPage({ searchParams }: RecruitingJobsPageProps) {
  const access = await requireModulePageAccess("recruiting-jobs");
  const params = await searchParams;

  // /recruiting-jobs?id=<job> is how the old one-page workspace selected a job,
  // and a lot of the app still links that way — candidate applications, the
  // offers board, the command center, the duplicate-cluster tools. Those files
  // belong to other sessions, so the old address keeps working by landing on the
  // job's own page.
  if (params?.id) {
    redirect(`/recruiting-jobs/${params.id}`);
  }

  const query = params?.q?.trim() ?? "";
  // access.viewer, not just access.role: the applicant counts on the cards are
  // the ones this viewer is allowed to see.
  const [data, noJobRequirements] = await Promise.all([
    getRecruitingJobsData(query, undefined, access.viewer),
    // Requirements with no live job, listed under the jobs so they stay findable
    // now that there is no Pilot Requirements page.
    getNoJobRequirements()
  ]);

  // Only the list crosses to the client. getRecruitingJobsData also builds the
  // full detail for every job — that is how the old page switched selection with
  // no round trip, and it shipped every applicant's name and current title for
  // every job in the first paint (1.8MB of HTML) to draw a list that shows
  // neither.
  return (
    <RecruitingJobsList
      jobs={data.jobs}
      query={query}
      canEdit={hasPermission(access.role, "jobs:write")}
      noJobRequirements={noJobRequirements.filter((requirement) => requirementMatches(requirement, query))}
    />
  );
}
