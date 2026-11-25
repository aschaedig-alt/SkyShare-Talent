import { redirect } from "next/navigation";
import { QualityOfHireReport } from "@/components/reports/QualityOfHireReport";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getQualityOfHire } from "@/lib/quality-of-hire/report";

export const dynamic = "force-dynamic";

// Reports > Hiring > Hire quality. Admins only: it names why each person left
// (Paycom's term reasons). Anyone else typing the URL lands on At a glance.
export default async function QualityReportPage() {
  const { role } = await requireModulePageAccess("reports");
  if (role !== "ADMIN") redirect("/reports");
  return <QualityOfHireReport qoh={await getQualityOfHire()} canUpload />;
}
