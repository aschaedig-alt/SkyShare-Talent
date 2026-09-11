import { requireModulePageAccess } from "@/lib/data/module-access";
import { getBusinessCards } from "@/lib/data/business-cards";
import { getCardOrderSettings } from "@/lib/business-cards/order-batch";
import { BusinessCardsWorkspace } from "@/components/business-cards/BusinessCardsWorkspace";

export const dynamic = "force-dynamic";

export default async function BusinessCardsPage() {
  await requireModulePageAccess("people");
  const [cards, orderSettings] = await Promise.all([getBusinessCards(), getCardOrderSettings()]);
  return <BusinessCardsWorkspace cards={cards} minBatch={orderSettings.minBatch} />;
}
