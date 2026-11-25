import { SourcesWorkspace } from "@/components/sources/SourcesWorkspace";
import { PaycomMismatches } from "@/components/reports/PaycomMismatches";
import { R } from "@/components/reports/report-ui";
import { getSourceAudit } from "@/lib/data/sources";
import { getQualityOfHire } from "@/lib/quality-of-hire/report";
import { requireModulePageAccess } from "@/lib/data/module-access";

export const dynamic = "force-dynamic";

// Data > Cleanup (Nov 24 2026, Reports phase 2): the upkeep that used to sit inside
// reports, so a report can be read and shared without a to-do list in it.
//   - Source names, from Reports > Sources. Who may change one is what the save route
//     checks (app/api/sources/names): admin or recruiter always, anyone else only with
//     EDIT on Reports.
//   - Paycom and Journey disagree, from Hire quality. ADMINS ONLY: it comes from Hire
//     quality's data, which names why people left.
export default async function CleanupPage() {
  const { role, rule } = await requireModulePageAccess("reports");
  const canEdit = role === "ADMIN" || role === "RECRUITER" || rule.accessLevel === "EDIT" || rule.accessLevel === "FULL_ACCESS";
  const [audit, qoh] = await Promise.all([getSourceAudit(), role === "ADMIN" ? getQualityOfHire() : Promise.resolve(null)]);

  return (
    <div className={R.page}>
      <section className={R.pageHeader}>
        <div>
          <p className={R.eyebrow}>Data</p>
          <h1 className={R.pageTitle}>Cleanup</h1>
          <p className={R.pageLede}>Upkeep that keeps the reports right. Nothing here is a report; fixing something here changes what the reports count.</p>
        </div>
      </section>
      {qoh ? <PaycomMismatches mismatches={qoh.mismatches} /> : null}
      <SourcesWorkspace audit={audit} canEdit={canEdit} mode="cleanup" />
    </div>
  );
}
