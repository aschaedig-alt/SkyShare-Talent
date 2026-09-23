import { notFound } from "next/navigation";
import { RecruitingJobPage } from "@/components/recruiting-jobs/RecruitingJobPage";
import { getRecruitingJobsData } from "@/lib/data/recruiting-jobs";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { hasPermission } from "@/lib/auth/roles";

type JobPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string }>;
};

export default async function RecruitingJobDetailPage({ params, searchParams }: JobPageProps) {
  const access = await requireModulePageAccess("recruiting-jobs");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  // access.viewer, not just access.role: the detail carries an applicant name and
  // current title for every application on this job.
  const data = await getRecruitingJobsData("", id, access.viewer);

  // details[id], not selectedJob: getRecruitingJobsData falls back to the first
  // job when the id it was given matches nothing, which on a per-job URL would
  // quietly show somebody a different job than the one they asked for.
  const job = data.details[id];
  if (!job) {
    notFound();
  }

  // ?tab= is read here so the first paint is the section that was linked to,
  // rather than Overview flashing before the client swaps it.
  return <RecruitingJobPage job={job} canEdit={hasPermission(access.role, "jobs:write")} requestedTab={sp?.tab} />;
}
