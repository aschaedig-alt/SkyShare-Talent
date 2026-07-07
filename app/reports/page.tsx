import { ReportsWorkspace } from "@/components/reports/ReportsWorkspace";
import { getReportsData } from "@/lib/data/reports";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getWorkspaceBranding, resolveBrandingLogo } from "@/lib/data/branding";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const { role } = await requireModulePageAccess("reports");
  const data = await getReportsData();
  const branding = await getWorkspaceBranding();

  return <ReportsWorkspace data={data} logoDataUrl={resolveBrandingLogo(branding, "reports")} canShare={role === "ADMIN"} />;
}
