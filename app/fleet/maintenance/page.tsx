import { requireModulePageAccess } from "@/lib/data/module-access";
import { hasPermission } from "@/lib/auth/roles";
import { getMxRoster } from "@/lib/fleet/staffing/mx-roster.server";
import MaintenanceOrgChart from "@/components/fleet/orgchart/MaintenanceOrgChart";

export const dynamic = "force-dynamic";

export default async function MaintenanceOrgChartPage() {
  const { role } = await requireModulePageAccess("fleet");
  const { groups, links } = await getMxRoster();
  const canEdit = hasPermission(role, "settings:admin");
  return (
    <div className="p-4 md:p-6">
      <MaintenanceOrgChart initialGroups={groups} initialLinks={links} canEdit={canEdit} />
    </div>
  );
}
