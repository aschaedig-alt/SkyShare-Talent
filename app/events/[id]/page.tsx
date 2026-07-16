import { notFound } from "next/navigation";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getEventDetail } from "@/lib/data/events";
import { EventDetailWorkspace } from "@/components/events/EventDetailWorkspace";

export const dynamic = "force-dynamic";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModulePageAccess("events");
  const { id } = await params;
  const event = await getEventDetail(id);
  if (!event) {
    notFound();
  }
  return <EventDetailWorkspace event={event} />;
}
