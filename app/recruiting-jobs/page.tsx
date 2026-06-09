import { RecruitingJobsWorkspace } from "@/components/recruiting-jobs/RecruitingJobsWorkspace";
import { getRecruitingJobsData } from "@/lib/data/recruiting-jobs";
import { requireModulePageAccess } from "@/lib/data/module-access";

type RecruitingJobsPageProps = {
  searchParams?: Promise<{ q?: string; id?: string }>;
};

export default async function RecruitingJobsPage({ searchParams }: RecruitingJobsPageProps) {
  await requireModulePageAccess("recruiting-jobs");
  const params = await searchParams;
  const query = params?.q?.trim() ?? "";
  const data = await getRecruitingJobsData(query, params?.id);

  return <RecruitingJobsWorkspace data={data} query={query} />;
}
