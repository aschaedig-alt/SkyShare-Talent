import { FleetPositionsView } from "@/components/fleet/FleetPositionsView";
import { requireModulePageAccess } from "@/lib/data/module-access";

// Moved out of Admin settings (it lived at /settings/fleet, which still
// redirects here). This is the canonical list of every pilot position we hire
// for — recruiting reference data that Jobs, Pilot Requirements and Matchboard
// all resolve against, not an administrative setting.
//
// The module-access question that paused this move for a month turns out to be
// benign: FleetPositionsView is READ-ONLY. The master list is FLEET_POSITIONS.md
// plus `npm run fleet:sync`, so gating on "fleet" instead of "settings" widens
// who can READ the registry and grants nobody a way to change it.
export default async function FleetPositionsPage() {
  await requireModulePageAccess("fleet");
  return <FleetPositionsView />;
}
