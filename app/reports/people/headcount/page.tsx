import { HeadcountTenureReport } from "@/components/reports/HeadcountTenureReport";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getHeadcountHistory } from "@/lib/data/headcount-history";

export const dynamic = "force-dynamic";

// Reports > People > Headcount & tenure. Loaded here and never on the public share
// link (app/r/[token]): the history names past employees.
export default async function HeadcountReportPage() {
  await requireModulePageAccess("reports");
  return <HeadcountTenureReport history={await getHeadcountHistory()} />;
}
