import { CandidatesWorkspace } from "@/components/candidates/CandidatesWorkspace";
import { getCandidateListData } from "@/lib/data/candidates";
import { requireModulePageAccess } from "@/lib/data/module-access";

type CandidatesPageProps = {
  searchParams?: Promise<{ q?: string }>;
};

export default async function CandidatesPage({ searchParams }: CandidatesPageProps) {
  await requireModulePageAccess("candidates");
  const params = await searchParams;
  const query = params?.q?.trim() ?? "";
  const data = await getCandidateListData(query);

  return <CandidatesWorkspace data={data} query={query} />;
}
