import { RecruitingJobsWorkspace } from "@/components/recruiting-jobs/RecruitingJobsWorkspace";
import { getRecruitingJobsData } from "@/lib/data/recruiting-jobs";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getPageLayout } from "@/lib/data/page-layout";
import { getDocumentCurrency } from "@/lib/data/document-currency";
import { hasPermission } from "@/lib/auth/roles";

type RecruitingJobsPageProps = {
  searchParams?: Promise<{ q?: string; id?: string }>;
};

export default async function RecruitingJobsPage({ searchParams }: RecruitingJobsPageProps) {
  const access = await requireModulePageAccess("recruiting-jobs");
  const params = await searchParams;
  const query = params?.q?.trim() ?? "";
  const [data, saved, documentCurrency] = await Promise.all([
    // access.viewer, not just access.role: the job detail carries an applicant
    // name and current title for every application, shipped with the first paint.
    getRecruitingJobsData(query, params?.id, access.viewer),
    getPageLayout("recruiting-jobs"),
    // Same reason as above - the currency panel lists candidate names as links.
    getDocumentCurrency(access.viewer)
  ]);

  return (
    <RecruitingJobsWorkspace
      data={data}
      query={query}
      canEdit={hasPermission(access.role, "jobs:write")}
      savedLayout={saved.layout}
      savedWidgets={saved.widgets}
      widgetData={{ documentCurrency }}
    />
  );
}
