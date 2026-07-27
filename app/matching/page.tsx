import { MatchboardWorkspace, type MatchboardMode } from "@/components/matchboard/MatchboardWorkspace";
import { getMatchboardSubjects, getRoleScreening, getCandidateRoleMatches } from "@/lib/matching/matchboard";
import { requireModulePageAccess } from "@/lib/data/module-access";

type MatchingPageProps = {
  searchParams?: Promise<{ mode?: string; id?: string }>;
};

export default async function MatchingPage({ searchParams }: MatchingPageProps) {
  await requireModulePageAccess("matching");
  const params = await searchParams;
  const mode: MatchboardMode =
    params?.mode === "candidate" ? "candidate" : params?.mode === "skipped" ? "skipped" : "role";
  const id = params?.id?.trim() || null;

  const subjects = await getMatchboardSubjects();
  const [roleData, candidateData] = await Promise.all([
    mode === "role" ? getRoleScreening(id) : Promise.resolve(null),
    mode === "candidate" ? getCandidateRoleMatches(id) : Promise.resolve(null)
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
