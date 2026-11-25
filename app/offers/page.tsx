import { OffersWorkspace } from "@/components/offers/OffersWorkspace";
import { QualityOfHireTracking } from "@/components/reports/QualityOfHireTracking";
import { getOffersBoard } from "@/lib/data/offers";
import { getQohTracking } from "@/lib/quality-of-hire/tracking";
import { requireModulePageAccess } from "@/lib/data/module-access";

export const dynamic = "force-dynamic";

// Offers are a view of candidate applications, so they ride on the candidates
// module's access rather than introducing a separate one: if you can see a
// candidate, you can see the offer on them.
export default async function OffersPage() {
  // Bind the access object rather than discarding it: this page was the ONE
  // requireModulePageAccess("candidates") call site that threw the return value away,
  // and because it rides on the candidates module it is reachable by exactly the
  // accounts the allowlist narrows. Without the viewer it server-rendered the whole
  // offer pipeline - names, emails and decline reasons - straight into their sidebar.
  const access = await requireModulePageAccess("candidates");
  // The Quality of Hire tracking check (milestone 4) moved here from Reports on Nov 24
  // 2026: it is a worklist of offers. ADMINS ONLY - its loader is not narrowed by the
  // candidate allowlist, so nobody else may be handed it.
  const [board, tracking] = await Promise.all([getOffersBoard(access.viewer), access.role === "ADMIN" ? getQohTracking() : Promise.resolve(null)]);
  return (
    <>
      <OffersWorkspace board={board} />
      {tracking ? (
        <div className="px-5 pb-5 lg:px-8">
          <QualityOfHireTracking tracking={tracking} />
        </div>
      ) : null}
    </>
  );
}
