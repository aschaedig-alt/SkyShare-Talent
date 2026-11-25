import { notFound } from "next/navigation";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { hasPermission } from "@/lib/auth/roles";
import { getStoreSummary } from "@/lib/party-store/server";
import { PartyStoreWorkspace } from "@/components/party-store/PartyStoreWorkspace";

export const dynamic = "force-dynamic";

export default async function PartyStorePage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireModulePageAccess("events");
  if (!hasPermission(access.role, "events:write")) notFound();
  const { id } = await params;
  const summary = await getStoreSummary(id);
  if (!summary) notFound();
  return <PartyStoreWorkspace initial={summary} />;
}
