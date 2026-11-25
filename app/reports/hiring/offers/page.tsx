import { redirect } from "next/navigation";
import { OffersReport, type OffersData } from "@/components/reports/OffersReport";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getQualityOfHire } from "@/lib/quality-of-hire/report";
import { median } from "@/lib/quality-of-hire/summary";

export const dynamic = "force-dynamic";

// Reports > Hiring > Offers. Admins only, like Hire quality whose data it reads; only
// the counts are sent to the browser.
export default async function OffersReportPage() {
  const { role } = await requireModulePageAccess("reports");
  if (role !== "ADMIN") redirect("/reports");
  const qoh = await getQualityOfHire();
  const hires = qoh.hires.filter((h) => !h.contractor);
  const toOffer = hires.flatMap((h) => (h.daysApplyToOffer === null ? [] : [h.daysApplyToOffer]));
  const toStart = hires.flatMap((h) => (h.daysApplyToStart === null ? [] : [h.daysApplyToStart]));
  const data: OffersData = {
    years: qoh.offers,
    declineReasons: qoh.declineReasons,
    neverStarted: qoh.neverStarted,
    toOffer: { median: median(toOffer), of: toOffer.length },
    toStart: { median: median(toStart), of: toStart.length }
  };
  return <OffersReport data={data} />;
}
