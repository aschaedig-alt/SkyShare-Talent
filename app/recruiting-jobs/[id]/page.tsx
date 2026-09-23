import { notFound } from "next/navigation";
import { RecruitingJobPage } from "@/components/recruiting-jobs/RecruitingJobPage";
import { getRecruitingJobsData } from "@/lib/data/recruiting-jobs";
import { getJobRequirementTab } from "@/lib/data/pilot-requirements";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { hasPermission, isAdminOrRecruiter } from "@/lib/auth/roles";

type JobPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string; req?: string }>;
};

export default async function RecruitingJobDetailPage({ params, searchParams }: JobPageProps) {
  const access = await requireModulePageAccess("recruiting-jobs");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  // access.viewer, not just access.role: the detail carries an applicant name and
  // current title for every application on this job.
  //
  // The Pilot requirement tab's data is loaded with the page rather than when the
  // tab opens: it is one job's requirements (gates, tails, history), not a scan,
  // and the Overview and Candidates tabs need to know whether the role is on the
  // Matchboard. ?req= picks one when the job holds more than one.
  const [data, requirementTab] = await Promise.all([
    getRecruitingJobsData("", id, access.viewer),
    getJobRequirementTab(id, sp?.req)
  ]);

  // details[id], not selectedJob: getRecruitingJobsData falls back to the first
  // job when the id it was given matches nothing, which on a per-job URL would
  // quietly show somebody a different job than the one they asked for.
  const job = data.details[id];
  if (!job) {
    notFound();
  }

  // ?tab= is read here so the first paint is the section that was linked to,
  // rather than Overview flashing before the client swaps it.
  return (
    <RecruitingJobPage
      job={job}
      canEdit={hasPermission(access.role, "jobs:write")}
      requestedTab={sp?.tab}
      requirementTab={requirementTab}
      requestedRequirement={sp?.req}
      permissions={{
        canEditJob: hasPermission(access.role, "jobs:write"),
        canEditRequirement: hasPermission(access.role, "requirements:write"),
        // The same gate the scoring actions check (canEditScoring).
        canEditScoring: isAdminOrRecruiter(access.role)
      }}
    />
  );
}
