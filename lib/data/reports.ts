import { getDocumentCurrency, type DocumentCurrency } from "@/lib/data/document-currency";
import type { CandidateAccessScope } from "@/lib/auth/candidate-scope";
import { getTravelSpendSummary, type TravelSpendSummary } from "@/lib/data/travel";
import { getUpgradeAnalytics, type UpgradeAnalytics } from "@/lib/data/employee-journey";

export type ReportsData = {
  documentCurrency: DocumentCurrency;
  travelSpend: TravelSpendSummary;
  pilotUpgrades: UpgradeAnalytics;
};

// viewer is optional so a non-request caller keeps working, but app/reports must
// pass it: the document-currency panel lists candidate names as profile links.
export async function getReportsData(viewer?: CandidateAccessScope | null): Promise<ReportsData> {
  const [documentCurrency, travelSpend, pilotUpgrades] = await Promise.all([
    getDocumentCurrency(viewer),
    getTravelSpendSummary(),
    getUpgradeAnalytics()
  ]);

  return {
    documentCurrency,
    travelSpend,
    pilotUpgrades
  };
}
