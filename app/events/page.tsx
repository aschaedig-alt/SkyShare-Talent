import { requireModulePageAccess } from "@/lib/data/module-access";
import { getEvents, getReorderCount, getEventRoster } from "@/lib/data/events";
import { EventsOverview } from "@/components/events/EventsOverview";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  await requireModulePageAccess("events");
  const [events, reorderCount, roster] = await Promise.all([getEvents(), getReorderCount(), getEventRoster()]);
  return (
    <EventsOverview
      upcoming={events.upcoming}
      past={events.past}
      reorderCount={reorderCount}
      roster={roster}
    />
  );
}
