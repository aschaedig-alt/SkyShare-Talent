import { cookies } from "next/headers";
import { CandidatesWorkspace } from "@/components/candidates/CandidatesWorkspace";
import { getCandidateListData, getCandidateTagOptions } from "@/lib/data/candidates";
import { CANDIDATE_LIST_LIMIT, CANDIDATE_PAGE_SIZES } from "@/lib/candidates/list-config";
import { isCandidateDepartmentKey } from "@/lib/candidates/departments";
import { isCandidateAcross, isCandidateBucket, type CandidateBucket } from "@/lib/candidates/buckets";
import { getStageList } from "@/lib/data/candidate-stages";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { isAdminOrRecruiter } from "@/lib/auth/roles";
import {
  CANDIDATE_VIEW_COOKIE,
  parseViewPreference
} from "@/lib/candidates/view-preference";
import { parseListParam } from "@/lib/candidates/list-url";

type CandidatesPageProps = {
  searchParams?: Promise<{
    q?: string;
    from?: string;
    tags?: string;
    depts?: string;
    size?: string;
    stages?: string;
    bucket?: string;
    across?: string;
  }>;
};

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
  const activeTags = parseListParam(params?.tags);
  // Unknown department keys are dropped rather than passed through, so a
  // hand-edited ?depts= cannot produce an empty list that looks like a bug.
  const activeDepartments = parseListParam(params?.depts).filter(isCandidateDepartmentKey);
  // The remembered view fills in only where the URL says NOTHING. An explicit
  // param always wins, so a link somebody sent you shows what they saw rather
  // than what you last looked at, and ?size= / ?bucket= stay honest.
  const remembered = parseViewPreference((await cookies()).get(CANDIDATE_VIEW_COOKIE)?.value);

  const requestedSize = Number(params?.size);
  const pageSize = CANDIDATE_PAGE_SIZES.includes(requestedSize as (typeof CANDIDATE_PAGE_SIZES)[number])
    ? requestedSize
    : params?.size !== undefined
      ? CANDIDATE_LIST_LIMIT // an explicit but unusable ?size= means the default
      : remembered.size;

  const activeStages = parseListParam(params?.stages);
  // requireModulePageAccess already resolved the viewer, so take it from there
  // rather than calling resolveViewerScope again. Same object either way — the
  // resolver is React-cached per request — but one caller means one place to
  // look when asking what this page scoped itself to.
  // An unknown ?bucket= is dropped rather than passed through, so a hand-edited
  // URL cannot produce an empty list that looks like a bug — same rule the
  // department param above follows.
  //
  // Written as a function rather than a nested ternary so the type narrowing
  // survives: an unknown value has to become null, and the remembered one is
  // only consulted when the URL is silent.
  const activeBucket = ((): CandidateBucket | null => {
    if (params?.bucket !== undefined) {
      const asked = params.bucket.trim();
      return isCandidateBucket(asked) ? asked : null;
    }
    const last = remembered.bucket ?? "";
    return isCandidateBucket(last) ? last : null;
  })();
  const acrossParam = params?.across?.trim() ?? "";
  const activeAcross = isCandidateAcross(acrossParam) ? acrossParam : null;
  const [data, tagOptions, stageList] = await Promise.all([
    getCandidateListData({
      query,
      viewer: access.viewer,
      tags: activeTags,
      departments: activeDepartments,
      stages: activeStages,
      limit: pageSize,
      bucket: activeBucket,
      across: activeAcross
    }),
    getCandidateTagOptions(),
    getStageList()
  ]);
  console.log(
    `[perf] /candidates page: access check ${afterAccess - pageStart}ms, data+layout ${Date.now() - afterAccess}ms, total ${Date.now() - pageStart}ms`
  );

  // Archived tags are dropped from the FILTER here rather than inside
  // getCandidateTagOptions, because the manage page needs the full list — that
  // is where you go to see what has been put away and restore it.
  const visibleTagOptions = tagOptions.filter((t) => !t.archived);

  return (
    <CandidatesWorkspace
      data={data}
      query={query}
      tagOptions={visibleTagOptions}
      activeTags={activeTags}
      activeDepartments={activeDepartments}
      activeStages={activeStages}
      canEdit={isAdminOrRecruiter(access.role)}
      onboardingIntent={params?.from === "onboarding"}
      activeBucket={activeBucket}
      activeAcross={activeAcross}
      stageList={stageList}
    />
  );
}
