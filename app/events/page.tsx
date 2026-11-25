import { requireModulePageAccess } from "@/lib/data/module-access";
import { getEvents, getReorderCount, getEventRoster, getEventCalendar } from "@/lib/data/events";
import { EventsOverview } from "@/components/events/EventsOverview";

export const dynamic = "force-dynamic";

// Recruiting > Events & Outreach > Career Fairs: the EXTERNAL events. Internal ones
// (the holiday party) are People > Company Events, /company-events (Nov 25 2026).
export default async function EventsPage() {
  await requireModulePageAccess("events");
  const [events, reorderCount, roster, calendar] = await Promise.all([
    getEvents("EXTERNAL"),
    getReorderCount(),
    getEventRoster(),
    getEventCalendar("EXTERNAL")
  ]);
  return (
    <EventsOverview
      audience="EXTERNAL"
      upcoming={events.upcoming}
      past={events.past}
      calendar={calendar}
      reorderCount={reorderCount}
      roster={roster}
    />
  );
}
