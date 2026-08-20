import { MatchboardWorkspace, type MatchboardMode } from "@/components/matchboard/MatchboardWorkspace";
import { getMatchboardSubjects, getRoleScreening, getCandidateRoleMatches } from "@/lib/matching/matchboard";
import { requireModulePageAccess } from "@/lib/data/module-access";

type MatchingPageProps = {
  searchParams?: Promise<{ mode?: string; id?: string }>;
};

export default async function MatchingPage({ searchParams }: MatchingPageProps) {
  const access = await requireModulePageAccess("matching");
  const params = await searchParams;
  const mode: MatchboardMode =
    params?.mode === "candidate" ? "candidate" : params?.mode === "skipped" ? "skipped" : "role";
  const id = params?.id?.trim() || null;

  // The server actions behind this page were gated, but the first-paint payload
  // was not: the picker carried every name in the scan pool and the initial
  // selection carried a whole-pool ranked scan. The viewer is threaded into the
  // loaders so the pool is narrowed at the query; it is null-equivalent for
  // anyone without an allowlist, who therefore sees exactly what they did.
  const subjects = await getMatchboardSubjects(access.viewer);
  const [roleData, candidateData] = await Promise.all([
    mode === "role" ? getRoleScreening(id, false, access.viewer) : Promise.resolve(null),
    mode === "candidate" ? getCandidateRoleMatches(id, access.viewer) : Promise.resolve(null)
  ]);

  return (
    <MatchboardWorkspace
      subjects={subjects}
      mode={mode}
      selectedId={id}
      roleData={roleData}
      candidateData={candidateData}
    />
  );
}
