import { OffersWorkspace } from "@/components/offers/OffersWorkspace";
import { getOffersBoard } from "@/lib/data/offers";
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
  const board = await getOffersBoard(access.viewer);
  return <OffersWorkspace board={board} />;
}
