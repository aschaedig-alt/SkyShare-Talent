import { TurnoverReport } from "@/components/reports/TurnoverReport";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getTurnoverHistory } from "@/lib/data/rolling-turnover";

export const dynamic = "force-dynamic";

// Reports > People > Turnover: rolling 12-month turnover in the Turnover Manager
// Dashboard's 13 departments (asked for 2026-11-24), with its Month and Year pickers.
// ?end=YYYY-MM opens it on a month. Counts only - no names.
export default async function TurnoverReportPage({ searchParams }: { searchParams: Promise<{ end?: string | string[] }> }) {
  await requireModulePageAccess("reports");
  const { end } = await searchParams;
  const pick = typeof end === "string" && /^\d{4}-\d{2}$/.test(end) ? end : null;
  return <TurnoverReport history={await getTurnoverHistory()} initialEnd={pick} />;
}
