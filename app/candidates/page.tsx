import { CandidatesWorkspace } from "@/components/candidates/CandidatesWorkspace";
import { getCandidateListData, getCandidateTagOptions } from "@/lib/data/candidates";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getPageLayout } from "@/lib/data/page-layout";
import { isAdminOrRecruiter } from "@/lib/auth/roles";
import { resolveViewerScope } from "@/lib/auth/viewer-scope";

type CandidatesPageProps = {
  searchParams?: Promise<{ q?: string; from?: string; tags?: string }>;
};

/** ?tags=Hot+lead,Veteran — comma-separated so the filter survives a copied URL. */
function parseTagParam(value: string | undefined): string[] {
  if (!value) return [];
  return [...new Set(value.split(",").map((t) => t.trim()).filter(Boolean))];
}

export default async function CandidatesPage({ searchParams }: CandidatesPageProps) {
  // TEMPORARY diagnostic — see the matching note in getCandidateListData.
  // Times the ACCESS CHECK separately from the data fetch, since a slow
  // getWorkspaceModuleAccessPolicy() lookup would look identical to a slow
  // candidate query from the outside and has caused a wrong diagnosis once
  // already on this page.
  const pageStart = Date.now();
  const access = await requireModulePageAccess("candidates");
  const afterAccess = Date.now();
  const params = await searchParams;
  const query = params?.q?.trim() ?? "";
  const activeTags = parseTagParam(params?.tags);
  const viewer = await resolveViewerScope(access.role, access.userId, access.email);
  const [data, layout, tagOptions] = await Promise.all([
    getCandidateListData(query, viewer, activeTags),
    getPageLayout("candidates"),
    getCandidateTagOptions()
  ]);
  console.log(
    `[perf] /candidates page: access check ${afterAccess - pageStart}ms, data+layout ${Date.now() - afterAccess}ms, total ${Date.now() - pageStart}ms`
  );

  return (
    <CandidatesWorkspace
      data={data}
      query={query}
      tagOptions={tagOptions}
      activeTags={activeTags}
      canEdit={isAdminOrRecruiter(access.role)}
      onboardingIntent={params?.from === "onboarding"}
      savedLayout={layout.layout}
      savedWidgets={layout.widgets}
    />
  );
}
