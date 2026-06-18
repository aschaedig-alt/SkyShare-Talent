import { RecruitingJobsWorkspace } from "@/components/recruiting-jobs/RecruitingJobsWorkspace";
import { getRecruitingJobsData } from "@/lib/data/recruiting-jobs";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getPageLayout } from "@/lib/data/page-layout";
import { getDocumentCurrency } from "@/lib/data/document-currency";

type RecruitingJobsPageProps = {
  searchParams?: Promise<{ q?: string; id?: string }>;
};

export default async function RecruitingJobsPage({ searchParams }: RecruitingJobsPageProps) {
  const access = await requireModulePageAccess("recruiting-jobs");
  const params = await searchParams;
  const query = params?.q?.trim() ?? "";
  const [data, saved, documentCurrency] = await Promise.all([
    getRecruitingJobsData(query, params?.id),
    getPageLayout("recruiting-jobs"),
    getDocumentCurrency()
  ]);

  return (
    <RecruitingJobsWorkspace
      data={data}
      query={query}
      canEdit={access.role === "ADMIN"}
      savedLayout={saved.layout}
      savedWidgets={saved.widgets}
      widgetData={{ documentCurrency }}
    />
  );
}
