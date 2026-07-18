import { CandidatesWorkspace } from "@/components/candidates/CandidatesWorkspace";
import { getCandidateListData } from "@/lib/data/candidates";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getPageLayout } from "@/lib/data/page-layout";
import { isAdminOrRecruiter } from "@/lib/auth/roles";

type CandidatesPageProps = {
  searchParams?: Promise<{ q?: string; from?: string }>;
};

export default async function CandidatesPage({ searchParams }: CandidatesPageProps) {
  const access = await requireModulePageAccess("candidates");
  const params = await searchParams;
  const query = params?.q?.trim() ?? "";
  const [data, layout] = await Promise.all([getCandidateListData(query), getPageLayout("candidates")]);

  return (
    <CandidatesWorkspace
      data={data}
      query={query}
      canEdit={isAdminOrRecruiter(access.role)}
      onboardingIntent={params?.from === "onboarding"}
      savedLayout={layout.layout}
      savedWidgets={layout.widgets}
    />
  );
}
