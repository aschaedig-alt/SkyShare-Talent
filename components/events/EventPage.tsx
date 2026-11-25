import { notFound, redirect } from "next/navigation";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { hasPermission } from "@/lib/auth/roles";
import { getEventDetail } from "@/lib/data/events";
import { eventHref, isEventTab, type EventTab } from "@/lib/events/constants";
import { getStoreSummary } from "@/lib/party-store/server";
import { getExecHuntAdminProps } from "@/lib/exec-hunt/admin-props";
import { EventDetailWorkspace } from "@/components/events/EventDetailWorkspace";
import { EventActivities } from "@/components/events/EventActivities";
import { EventGuestList } from "@/components/events/EventGuestList";
import { zoneForValue } from "@/lib/dates/display";
import { PartyStoreWorkspace } from "@/components/party-store/PartyStoreWorkspace";
import { NewStoreForm } from "@/components/party-store/NewStoreForm";
import { ExecHuntAdmin } from "@/components/exec-hunt/ExecHuntAdmin";
import { R } from "@/components/reports/report-ui";

/**
 * One event's page, served at BOTH homes (server component):
 *   /events/[id]          a career fair (EXTERNAL)
 *   /company-events/[id]  a company event (INTERNAL), in tabs
 * An event opened at the wrong address is sent to the right one, so every old link
 * and bookmark still lands, and the side menu lights the home it belongs to.
 */
export async function EventPage({
  id,
  servedAt,
  searchParams
}: {
  id: string;
  servedAt: "EXTERNAL" | "INTERNAL";
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const access = await requireModulePageAccess("events");
  const event = await getEventDetail(id);
  if (!event) notFound();

  const rawTab = typeof searchParams.tab === "string" ? searchParams.tab : undefined;
  if (event.audience !== servedAt) {
    redirect(`${eventHref(event)}${rawTab ? `?tab=${encodeURIComponent(rawTab)}` : ""}`);
  }
  if (event.audience !== "INTERNAL") return <EventDetailWorkspace event={event} />;

  const tab: EventTab = isEventTab(rawTab) ? rawTab : "overview";
  const canWrite = hasPermission(access.role, "events:write");

  let storeTab = null;
  if (tab === "store") {
    // The store's register, balances and settings need events:write, as on its own page.
    const summary = canWrite && event.storeId ? await getStoreSummary(event.storeId) : null;
    storeTab = !canWrite ? (
      <p key="store" className={R.panel}>Only people who can edit events can run the party store.</p>
    ) : summary ? (
      <PartyStoreWorkspace key="store" initial={summary} embedded />
    ) : (
      <section key="store" className={R.panel}>
        <h2 className={R.title}>Open the party store</h2>
        <p className={R.lede}>Store credit for every current employee, spent at the register on the night.</p>
        <NewStoreForm events={[{ id: event.id, name: event.name }]} fixedEventId={event.id} />
      </section>
    );
  }

  let activitiesTab = null;
  if (tab === "activities") {
    const hasHunt = event.activities.some((a) => a.kind === "SCAVENGER_HUNT");
    const huntAdmin = hasHunt && canWrite ? <ExecHuntAdmin {...await getExecHuntAdminProps()} embedded /> : null;
    activitiesTab = (
      <EventActivities
        key="activities"
        eventId={event.id}
        activities={event.activities}
        canWrite={canWrite}
        ownerSuggestions={event.ownerSuggestions}
        huntAdmin={huntAdmin}
      />
    );
  }

  // The party guest list (Aimee, Nov 25 2026): every employee, the live RSVP sheet, reminders.
  let guestsTab = null;
  if (tab === "guests") {
    const day = new Intl.DateTimeFormat("en-US", { timeZone: zoneForValue(event.startsAt), weekday: "long", month: "short", day: "numeric" }).format(new Date(event.startsAt));
    guestsTab = <EventGuestList key="guests" eventId={event.id} eventName={event.name} eventWhen={`${day}${event.venue ? ` at ${event.venue}` : ""}`} canWrite={canWrite} />;
  }

  return <EventDetailWorkspace event={event} tab={tab} storeTab={storeTab} activitiesTab={activitiesTab} guestsTab={guestsTab} />;
}
