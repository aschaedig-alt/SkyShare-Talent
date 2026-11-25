import { ImportsWorkspace } from "@/components/imports/ImportsWorkspace";
import { getImportsData } from "@/lib/data/imports";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { QOH_SOURCES } from "@/lib/quality-of-hire/imports";
import { SOURCE_TYPE as PAYCOM_EMPLOYEES } from "@/lib/paycom/employee-import";

export const dynamic = "force-dynamic";

// Recruiting > Records > Imports (candidates & jobs). Nov 25 2026, menu layout 2:
// the page was split three ways so each upload sits with what it feeds. The Paycom
// employee roster is People > Paycom roster import (/imports/paycom-employees) and
// the Hire quality uploads are Data > Upkeep (/imports/hire-quality). All three keep
// the imports module's access, so who can open what did not change.
//
// Those two keep their own upload history on their own pages, so their batches are
// left out of this page's Recent batches - the Hire quality ones are HR files, which
// a recruiter on this page was able to see listed by file name.
const ELSEWHERE = new Set<string>([...Object.values(QOH_SOURCES), PAYCOM_EMPLOYEES]);

export default async function ImportsPage() {
  await requireModulePageAccess("imports");
  const data = await getImportsData();

  return <ImportsWorkspace data={{ ...data, batches: data.batches.filter((b) => !ELSEWHERE.has(b.sourceType)) }} />;
}
