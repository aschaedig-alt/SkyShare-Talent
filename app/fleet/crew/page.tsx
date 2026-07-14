import { requireModulePageAccess } from "@/lib/data/module-access";
import CrewOrgChart from "@/components/fleet/orgchart/CrewOrgChart";

export const dynamic = "force-dynamic";

export default async function CrewOrgChartPage() {
  await requireModulePageAccess("fleet");
  return (
    <div className="p-4 md:p-6">
      <CrewOrgChart />
    </div>
  );
}
