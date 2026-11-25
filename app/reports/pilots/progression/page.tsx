import { PilotProgressions } from "@/components/reports/ReportsWorkspace";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getUpgradeAnalytics } from "@/lib/data/employee-journey";
import { getFleetStaffing } from "@/lib/data/fleet-staffing";

export const dynamic = "force-dynamic";

// Reports > Pilots > Fleet progression: upgrades, aircraft moves and seats filled.
// Staffing is passed here and deliberately not on the public share link - open
// requisitions and target headcounts behind a token URL is his call to make.
export default async function ProgressionReportPage() {
  await requireModulePageAccess("reports");
  const [upgrades, staffing] = await Promise.all([getUpgradeAnalytics(), getFleetStaffing()]);
  return <PilotProgressions upgrades={upgrades} staffing={staffing} />;
}
