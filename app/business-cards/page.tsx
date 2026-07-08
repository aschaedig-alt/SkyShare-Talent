import { requireModulePageAccess } from "@/lib/data/module-access";
import { getBusinessCards } from "@/lib/data/business-cards";
import { BusinessCardsWorkspace } from "@/components/business-cards/BusinessCardsWorkspace";

export const dynamic = "force-dynamic";

export default async function BusinessCardsPage() {
  await requireModulePageAccess("people");
  const cards = await getBusinessCards();
  return <BusinessCardsWorkspace cards={cards} />;
}
