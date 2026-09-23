import { getDocumentCurrency, type DocumentCurrency } from "@/lib/data/document-currency";
import type { CandidateAccessScope } from "@/lib/auth/candidate-scope";
import { getTravelSpendReport, type TravelSpendReport } from "@/lib/data/travel";
import { getUpgradeAnalytics, type UpgradeAnalytics } from "@/lib/data/employee-journey";
import { getFleetStaffing, type FleetStaffing } from "@/lib/data/fleet-staffing";

export type ReportsData = {
  documentCurrency: DocumentCurrency;
  /** Every non-canceled trip as a reporting row. The Reports travel tab builds
   *  its chart, tiles, breakdowns and table from these same rows, so a filter
   *  can never leave two of them disagreeing. It replaced a summary object plus
   *  a separate by-month series, which were two reads of the trips with two
   *  different rules for a trip's date. */
  travelSpend: TravelSpendReport;
  pilotUpgrades: UpgradeAnalytics;
  /** Filled vs target by aircraft type and seat — the Crew org chart's roster,
   *  summarised. Every executive review of the progression report asked for it. */
  fleetStaffing: FleetStaffing;
};

// viewer is optional so a non-request caller keeps working, but app/reports must
// pass it: the document-currency panel lists candidate names as profile links.
export async function getReportsData(viewer?: CandidateAccessScope | null): Promise<ReportsData> {
  const [documentCurrency, travelSpend, pilotUpgrades, fleetStaffing] = await Promise.all([
    getDocumentCurrency(viewer),
    getTravelSpendReport(),
    getUpgradeAnalytics(),
    getFleetStaffing()
  ]);

  return {
    documentCurrency,
    travelSpend,
    pilotUpgrades,
    fleetStaffing
  };
}
