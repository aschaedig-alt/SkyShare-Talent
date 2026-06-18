import { FleetPositionsView } from "@/components/fleet/FleetPositionsView";
import { requireModulePageAccess } from "@/lib/data/module-access";

export default async function SettingsFleetPage() {
  await requireModulePageAccess("settings");
  return <FleetPositionsView />;
}
