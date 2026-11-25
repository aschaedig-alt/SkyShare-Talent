import { TravelSpendReport } from "@/components/travel/TravelSpendReport";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getTravelSpendReport } from "@/lib/data/travel";

export const dynamic = "force-dynamic";

// Reports > Costs > Hiring travel. Lives beside the Travel page's year panel
// (components/travel/TravelSpendReport.tsx), so the two cannot drift.
export default async function TravelReportPage() {
  await requireModulePageAccess("reports");
  const { trips } = await getTravelSpendReport();
  return <TravelSpendReport trips={trips} />;
}
