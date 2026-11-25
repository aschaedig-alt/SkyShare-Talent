import { requireModulePageAccess } from "@/lib/data/module-access";
import { getEvents, getEventRoster, getEventCalendar } from "@/lib/data/events";
import { EventsOverview } from "@/components/events/EventsOverview";

export const dynamic = "force-dynamic";

// People > Company Events: the INTERNAL events - the holiday party, team events
// (Aimee, Nov 25 2026). Same events module as Career Fairs, so the same people can
// open it; an event made here can still be marked external and goes to Career Fairs.
export default async function CompanyEventsPage() {
  await requireModulePageAccess("events");
  const [events, roster, calendar] = await Promise.all([getEvents("INTERNAL"), getEventRoster(), getEventCalendar("INTERNAL")]);
  return (
    <EventsOverview
      audience="INTERNAL"
      upcoming={events.upcoming}
      past={events.past}
      calendar={calendar}
      reorderCount={0}
      roster={roster}
    />
  );
}
