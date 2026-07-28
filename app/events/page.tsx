import { requireModulePageAccess } from "@/lib/data/module-access";
import { getEvents, getReorderCount, getEventRoster, getEventCalendar } from "@/lib/data/events";
import { EventsOverview } from "@/components/events/EventsOverview";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  await requireModulePageAccess("events");
  const [events, reorderCount, roster, calendar] = await Promise.all([
    getEvents(),
    getReorderCount(),
    getEventRoster(),
    getEventCalendar()
  ]);
  return (
    <EventsOverview
      upcoming={events.upcoming}
      past={events.past}
      calendar={calendar}
      reorderCount={reorderCount}
      roster={roster}
    />
  );
}
