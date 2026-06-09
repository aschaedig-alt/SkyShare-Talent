import { PilotRequirementsWorkspace } from "@/components/pilot-requirements/PilotRequirementsWorkspace";
import { getPilotRequirementsData } from "@/lib/data/pilot-requirements";
import { requireModulePageAccess } from "@/lib/data/module-access";

type PilotRequirementsPageProps = {
  searchParams?: Promise<{ q?: string; id?: string }>;
};

export default async function PilotRequirementsPage({ searchParams }: PilotRequirementsPageProps) {
  await requireModulePageAccess("pilot-requirements");
  const params = await searchParams;
  const query = params?.q?.trim() ?? "";
  const data = await getPilotRequirementsData(query, params?.id);

  return <PilotRequirementsWorkspace data={data} query={query} />;
}
