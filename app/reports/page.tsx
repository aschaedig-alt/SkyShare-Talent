import { ReportsWorkspace } from "@/components/reports/ReportsWorkspace";
import { getReportsData } from "@/lib/data/reports";
import { getHeadcountHistory } from "@/lib/data/headcount-history";
import { getQualityOfHire } from "@/lib/quality-of-hire/report";
import { getCheckinReport } from "@/lib/quality-of-hire/checkins";
import { listSignoffRequests } from "@/lib/quality-of-hire/signoff-requests";
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
  //
  // Headcount history is loaded HERE rather than in getReportsData: that loader
  // also feeds the public share link (app/r/[token]), which shows only the
  // progression report and must not carry a roster of past employees by name.
  //
  // Quality of Hire names why each person left (Paycom's term reasons), so it is
  // loaded for admins only and the tab is not shown to anyone else.
  // The check-in ratings carry hiring managers' notes about named employees, so
  // they are admins-only on the same terms.
  const [data, branding, headcount, qoh, checkins, signoffRequests] = await Promise.all([
    getReportsData(viewer),
    getWorkspaceBranding(),
    getHeadcountHistory(),
    role === "ADMIN" ? getQualityOfHire() : Promise.resolve(null),
    role === "ADMIN" ? getCheckinReport() : Promise.resolve(null),
    // The definitions sign-off links and their answers (admins only).
    role === "ADMIN" ? listSignoffRequests() : Promise.resolve(null)
  ]);

  return (
    <ReportsWorkspace
      data={data}
      headcount={headcount}
      qoh={qoh}
      checkins={checkins}
      signoff={signoffRequests ? { requests: signoffRequests, pageUrl: "https://claude.ai/artifact/4QTzmvR92JLwxFiWZTMqdZ" } : null}
      logoDataUrl={resolveBrandingLogo(branding, "reports")}
      canShare={role === "ADMIN"}
    />
  );
}
