import { PilotRequirementsWorkspace } from "@/components/pilot-requirements/PilotRequirementsWorkspace";
import { getPilotRequirementsData } from "@/lib/data/pilot-requirements";
import { requireModulePageAccess } from "@/lib/data/module-access";

type PilotRequirementsPageProps = {
  searchParams?: Promise<{ q?: string; id?: string }>;
};

export default async function PilotRequirementsPage({ searchParams }: PilotRequirementsPageProps) {
  const access = await requireModulePageAccess("pilot-requirements");
  const params = await searchParams;
  const query = params?.q?.trim() ?? "";
  // candidateMatches for the initial selection are computed here, on the server,
  // and shipped with the first paint — the gate on the Scan action never sees
  // that list. Thread the viewer so the pool is narrowed at the query instead.
  const data = await getPilotRequirementsData(query, params?.id, access.viewer);

  return <PilotRequirementsWorkspace data={data} query={query} />;
}
