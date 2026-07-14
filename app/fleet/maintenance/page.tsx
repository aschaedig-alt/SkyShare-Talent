import { requireModulePageAccess } from "@/lib/data/module-access";
import MaintenanceOrgChart from "@/components/fleet/orgchart/MaintenanceOrgChart";

export const dynamic = "force-dynamic";

export default async function MaintenanceOrgChartPage() {
  await requireModulePageAccess("fleet");
  return (
    <div className="p-4 md:p-6">
      <MaintenanceOrgChart />
    </div>
  );
}
