import { requireModulePageAccess } from "@/lib/data/module-access";
import { getOnboardingWorkspaceData, type HireStage } from "@/lib/data/onboarding";
import { PreOnboardingWorkspace } from "@/components/people/PreOnboardingWorkspace";

export const dynamic = "force-dynamic";

function stageFromParam(value: string | undefined): HireStage {
  if (value === "post") return "POST_ONBOARD";
  if (value === "archived") return "ARCHIVED";
  return "ACTIVE";
}

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  await requireModulePageAccess("people");
  const sp = await searchParams;
  const stage = stageFromParam(sp.stage);
  const data = await getOnboardingWorkspaceData(stage);

  return <PreOnboardingWorkspace data={data} stage={stage} />;
}
