import { ReportsWorkspace } from "@/components/reports/ReportsWorkspace";
import { getReportsData } from "@/lib/data/reports";
import { requireModulePageAccess } from "@/lib/data/module-access";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  await requireModulePageAccess("reports");
  const data = await getReportsData();

  return <ReportsWorkspace data={data} />;
}
