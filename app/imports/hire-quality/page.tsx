import { notFound } from "next/navigation";
import { QualityOfHireUploads } from "@/components/reports/QualityOfHireUploads";
import { R } from "@/components/reports/report-ui";
import { getQohImports } from "@/lib/quality-of-hire/report";
import { requireModulePageAccess } from "@/lib/data/module-access";

export const dynamic = "force-dynamic";

// Data > Upkeep > Hire quality uploads: the Paycom terminations, HR's term types and
// the interview calendar that Reports > Hire quality reads. They sat at the bottom of
// the Imports page from Nov 24; on Nov 25 (menu layout 2) they got their own page next
// to Cleanup, because they feed a report, not recruiting.
//
// The address stays under /imports on purpose: that keeps the imports module's access
// exactly as it was. ADMINS ONLY, as before - the files name why people left.
export default async function HireQualityUploadsPage() {
  const { role } = await requireModulePageAccess("imports");
  if (role !== "ADMIN") notFound();
  const imports = await getQohImports();

  return (
    <div className={R.page}>
      <section className={R.pageHeader}>
        <div>
          <p className={R.eyebrow}>Data · Upkeep · HR only</p>
          <h1 className={R.pageTitle}>Hire quality uploads</h1>
          <p className={R.pageLede}>The three files Reports › Hire quality reads.</p>
        </div>
      </section>
      <section className={R.panel}>
        <QualityOfHireUploads imports={imports} />
      </section>
    </div>
  );
}
