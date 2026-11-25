import { ImportsWorkspace } from "@/components/imports/ImportsWorkspace";
import { QualityOfHireUploads } from "@/components/reports/QualityOfHireUploads";
import { R } from "@/components/reports/report-ui";
import { getImportsData } from "@/lib/data/imports";
import { getQohImports } from "@/lib/quality-of-hire/report";
import { requireModulePageAccess } from "@/lib/data/module-access";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const { role } = await requireModulePageAccess("imports");
  // The Hire quality uploads (Paycom terminations, HR's term types, the interview
  // calendar) moved here from Reports on Nov 24 2026: uploading is upkeep, not a
  // report. ADMINS ONLY, as they were on Reports - the files name why people left.
  const [data, qohImports] = await Promise.all([getImportsData(), role === "ADMIN" ? getQohImports() : Promise.resolve(null)]);

  return (
    <>
      <ImportsWorkspace data={data} />
      {qohImports ? (
        <div className="px-5 pb-5 lg:px-8">
          <section className={R.panel}>
            <p className={R.eyebrow}>Quality of Hire · HR only</p>
            <h2 className={R.title}>Hire quality uploads</h2>
            <p className={R.lede}>The three files Reports &gt; Hire quality reads.</p>
            <QualityOfHireUploads imports={qohImports} />
          </section>
        </div>
      ) : null}
    </>
  );
}
