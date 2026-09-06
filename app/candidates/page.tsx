import { CandidatesWorkspace } from "@/components/candidates/CandidatesWorkspace";
import { getCandidateListData, getCandidateTagOptions } from "@/lib/data/candidates";
import { CANDIDATE_LIST_LIMIT, CANDIDATE_PAGE_SIZES } from "@/lib/candidates/list-config";
import { isCandidateDepartmentKey } from "@/lib/candidates/departments";
import { isCandidateAcross, isCandidateBucket } from "@/lib/candidates/buckets";
import { getStageList } from "@/lib/data/candidate-stages";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { isAdminOrRecruiter } from "@/lib/auth/roles";

type CandidatesPageProps = {
  searchParams?: Promise<{
    q?: string;
    from?: string;
    tags?: string;
    depts?: string;
    size?: string;
    bucket?: string;
    across?: string;
  }>;
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
  // Unknown department keys are dropped rather than passed through, so a
  // hand-edited ?depts= cannot produce an empty list that looks like a bug.
  const activeDepartments = parseTagParam(params?.depts).filter(isCandidateDepartmentKey);
  const requestedSize = Number(params?.size);
  const pageSize = CANDIDATE_PAGE_SIZES.includes(requestedSize as (typeof CANDIDATE_PAGE_SIZES)[number])
    ? requestedSize
    : CANDIDATE_LIST_LIMIT;
  // requireModulePageAccess already resolved the viewer, so take it from there
  // rather than calling resolveViewerScope again. Same object either way — the
  // resolver is React-cached per request — but one caller means one place to
  // look when asking what this page scoped itself to.
  // An unknown ?bucket= is dropped rather than passed through, so a hand-edited
  // URL cannot produce an empty list that looks like a bug — same rule the
  // department param above follows.
  const bucketParam = params?.bucket?.trim() ?? "";
  const activeBucket = isCandidateBucket(bucketParam) ? bucketParam : null;
  const acrossParam = params?.across?.trim() ?? "";
  const activeAcross = isCandidateAcross(acrossParam) ? acrossParam : null;
  const [data, tagOptions, stageList] = await Promise.all([
    getCandidateListData(query, access.viewer, activeTags, activeDepartments, pageSize, activeBucket, activeAcross),
    getCandidateTagOptions(),
    getStageList()
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
      activeDepartments={activeDepartments}
      canEdit={isAdminOrRecruiter(access.role)}
      onboardingIntent={params?.from === "onboarding"}
      activeBucket={activeBucket}
      activeAcross={activeAcross}
      stageList={stageList}
    />
  );
}
