import { requireModulePageAccess } from "@/lib/data/module-access";
import { getSupplyItems } from "@/lib/data/events";
import { SuppliesWorkspace } from "@/components/events/SuppliesWorkspace";

export const dynamic = "force-dynamic";

export default async function SuppliesPage() {
  await requireModulePageAccess("events");
  const items = await getSupplyItems();
  return <SuppliesWorkspace items={items} />;
}
