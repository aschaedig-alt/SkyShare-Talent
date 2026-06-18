import { FleetPositionsView } from "@/components/fleet/FleetPositionsView";
import { requireModulePageAccess } from "@/lib/data/module-access";

export default async function FleetPage() {
  await requireModulePageAccess("fleet");
  return <FleetPositionsView />;
}
