import { requireModulePageAccess } from "@/lib/data/module-access";
import { getTravelOverview } from "@/lib/data/travel";
import { TravelHubWorkspace } from "@/components/travel/TravelHubWorkspace";

export const dynamic = "force-dynamic";

export default async function TravelPage() {
  await requireModulePageAccess("people");
  const data = await getTravelOverview();
  return <TravelHubWorkspace data={data} />;
}
