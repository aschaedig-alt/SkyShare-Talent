import { redirect } from "next/navigation";
import { CheckinReport } from "@/components/reports/CheckinReport";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getCheckinReport } from "@/lib/quality-of-hire/checkins";

export const dynamic = "force-dynamic";

// Reports > Hiring > Manager check-ins. Admins only: it carries hiring managers'
// notes about named employees.
export default async function CheckinsReportPage() {
  const { role } = await requireModulePageAccess("reports");
  if (role !== "ADMIN") redirect("/reports");
  return <CheckinReport report={await getCheckinReport()} />;
}
