import { redirect } from "next/navigation";
import { QualityBaseline } from "@/components/reports/QualityBaseline";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getQualityOfHire } from "@/lib/quality-of-hire/report";
import { computeBaseline } from "@/lib/quality-of-hire/baseline";
import { getFrozenBaseline } from "@/lib/quality-of-hire/baseline-store";

export const dynamic = "force-dynamic";

// Reports > Hiring > Hire quality baseline - Quality of Hire Milestone 3 (Dec 3 2026).
// Admins only for now, like the rest of Hiring: the numbers are counts, but they are
// worked out from Hire quality's data. Only the counts go to the browser.
export default async function BaselineReportPage() {
  const { role } = await requireModulePageAccess("reports");
  if (role !== "ADMIN") redirect("/reports");
  const [qoh, frozen] = await Promise.all([getQualityOfHire(), getFrozenBaseline()]);
  return <QualityBaseline live={computeBaseline(qoh)} frozen={frozen} canFreeze={role === "ADMIN"} />;
}
