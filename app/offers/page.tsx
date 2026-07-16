import { OffersWorkspace } from "@/components/offers/OffersWorkspace";
import { getOffersBoard } from "@/lib/data/offers";
import { requireModulePageAccess } from "@/lib/data/module-access";

export const dynamic = "force-dynamic";

// Offers are a view of candidate applications, so they ride on the candidates
// module's access rather than introducing a separate one: if you can see a
// candidate, you can see the offer on them.
export default async function OffersPage() {
  await requireModulePageAccess("candidates");
  const board = await getOffersBoard();
  return <OffersWorkspace board={board} />;
}
