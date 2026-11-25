import { TurnoverReport } from "@/components/reports/TurnoverReport";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getRollingTurnover } from "@/lib/data/rolling-turnover";

export const dynamic = "force-dynamic";

// Reports > People > Turnover: rolling 12-month turnover in the Turnover Manager
// Dashboard's 13 departments (asked for 2026-11-24). Counts only - no names.
export default async function TurnoverReportPage() {
  await requireModulePageAccess("reports");
  return <TurnoverReport data={await getRollingTurnover()} />;
}
