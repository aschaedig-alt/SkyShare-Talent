import { ReportsWorkspace } from "@/components/reports/ReportsWorkspace";
import { getReportsData } from "@/lib/data/reports";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getWorkspaceBranding, resolveBrandingLogo } from "@/lib/data/branding";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const { role, viewer } = await requireModulePageAccess("reports");
  // The document-currency panel lists candidate names as profile links, so this
  // report has to respect the same narrowing the candidate list does.
  //
  // In parallel: getWorkspaceBranding takes no arguments and reads nothing from
  // the report data. app/r/[token]/page.tsx runs the same pair this way (without
  // viewer, because the public share route deliberately has no one to scope to).
  const [data, branding] = await Promise.all([getReportsData(viewer), getWorkspaceBranding()]);

  return <ReportsWorkspace data={data} logoDataUrl={resolveBrandingLogo(branding, "reports")} canShare={role === "ADMIN"} />;
}
