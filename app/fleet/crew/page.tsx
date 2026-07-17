import { requireModulePageAccess } from "@/lib/data/module-access";
import { hasPermission } from "@/lib/auth/roles";
import { getCrewRoster } from "@/lib/fleet/staffing/roster.server";
import CrewOrgChart from "@/components/fleet/orgchart/CrewOrgChart";

export const dynamic = "force-dynamic";

export default async function CrewOrgChartPage() {
  const { role } = await requireModulePageAccess("fleet");
  const { groups, links } = await getCrewRoster();
  const canEdit = hasPermission(role, "settings:admin");
  return (
    <div className="p-4 md:p-6">
      <CrewOrgChart initialGroups={groups} initialLinks={links} canEdit={canEdit} />
    </div>
  );
}
