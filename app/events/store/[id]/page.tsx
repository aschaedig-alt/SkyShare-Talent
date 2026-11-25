import { notFound, redirect } from "next/navigation";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { hasPermission } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";
import { getStoreSummary } from "@/lib/party-store/server";
import { PartyStoreWorkspace } from "@/components/party-store/PartyStoreWorkspace";

export const dynamic = "force-dynamic";

// A store that belongs to a company event lives in that event's Party store tab
// (Nov 25 2026), so this address forwards there. A store with no event, or one
// on a career fair, still opens here.
export default async function PartyStorePage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireModulePageAccess("events");
  if (!hasPermission(access.role, "events:write")) notFound();
  const { id } = await params;
  const owner = await prisma.partyStore.findUnique({ where: { id }, select: { event: { select: { id: true, audience: true } } } });
  if (owner?.event?.audience === "INTERNAL") redirect(`/company-events/${owner.event.id}?tab=store`);
  const summary = await getStoreSummary(id);
  if (!summary) notFound();
  return <PartyStoreWorkspace initial={summary} />;
}
