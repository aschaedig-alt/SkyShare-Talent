import { getDocumentCurrency, type DocumentCurrency } from "@/lib/data/document-currency";
import { getTravelSpendSummary, type TravelSpendSummary } from "@/lib/data/travel";
import { getUpgradeAnalytics, type UpgradeAnalytics } from "@/lib/data/employee-journey";

export type ReportsData = {
  documentCurrency: DocumentCurrency;
  travelSpend: TravelSpendSummary;
  pilotUpgrades: UpgradeAnalytics;
};

export async function getReportsData(): Promise<ReportsData> {
  const [documentCurrency, travelSpend, pilotUpgrades] = await Promise.all([
    getDocumentCurrency(),
    getTravelSpendSummary(),
    getUpgradeAnalytics()
  ]);

  return {
    documentCurrency,
    travelSpend,
    pilotUpgrades
  };
}
