import { prisma } from "@/lib/prisma";
import { OPEN_EVENT_STATUSES, stockState, type StockState } from "@/lib/events/constants";

function iso(d: Date | null | undefined) {
  return d ? d.toISOString() : null;
}

export type EventListItem = {
  id: string;
  name: string;
  type: string;
  status: string;
  startsAt: string;
  endsAt: string | null;
  venue: string | null;
  city: string | null;
  state: string | null;
  ownerName: string | null;
  attendeeCount: number;
  confirmedCount: number;
  supplyCount: number;
  openTaskCount: number;
};

export type AttendeeView = {
  id: string;
  newHireId: string;
  name: string;
  position: string | null;
  status: string;
  role: string | null;
};

export type SupplyLineView = {
  id: string;
  supplyItemId: string | null;
  label: string;
  quantity: number;
  packed: boolean;
  /** Null when the line is a one-off not tracked in the stock room. */
  onHand: number | null;
  /** True when this event alone asks for more than the stock room holds. */
  short: boolean;
};

export type TaskView = {
  id: string;
  label: string;
  owner: string | null;
  dueAt: string | null;
  done: boolean;
};

export type PersonRef = { id: string; name: string; position: string | null };

export type SupplyItemRef = { id: string; name: string; unit: string; onHand: number };

export type EventDetail = {
  id: string;
  name: string;
  type: string;
  status: string;
  startsAt: string;
  endsAt: string | null;
  venue: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  ownerId: string | null;
  ownerName: string | null;
  budget: number | null;
  notes: string | null;
  attendees: AttendeeView[];
  supplies: SupplyLineView[];
  tasks: TaskView[];
  /** Everyone who could be added — the active roster, minus who is already on. */
  roster: PersonRef[];
  /** The stock room, for the "add a supply" picker. */
  stockRoom: SupplyItemRef[];
};

export type SupplyItemView = {
  id: string;
  name: string;
  category: string;
  unit: string;
  onHand: number;
  reorderThreshold: number;
  vendor: string | null;
  reorderUrl: string | null;
  unitCost: number | null;
  notes: string | null;
  active: boolean;
  /** Quantity claimed by events that have not happened yet. */
  committed: number;
  /** onHand - committed. What is actually free to promise. */
  projected: number;
  state: StockState;
  /** Which upcoming events are holding this item. */
  claims: { eventId: string; eventName: string; startsAt: string; quantity: number }[];
};

function personName(n: { name: string }) {
  return n.name;
}

export async function getEvents(): Promise<{ upcoming: EventListItem[]; past: EventListItem[] }> {
  const rows = await prisma.event.findMany({
    orderBy: [{ startsAt: "asc" }],
    include: {
      owner: { select: { name: true } },
      attendees: { select: { status: true } },
      supplies: { select: { id: true } },
      tasks: { select: { done: true } }
    }
  });

  const items: EventListItem[] = rows.map((e) => ({
    id: e.id,
    name: e.name,
    type: e.type,
    status: e.status,
    startsAt: e.startsAt.toISOString(),
    endsAt: iso(e.endsAt),
    venue: e.venue,
    city: e.city,
    state: e.state,
    ownerName: e.owner ? personName(e.owner) : null,
    attendeeCount: e.attendees.length,
    confirmedCount: e.attendees.filter((a) => a.status === "CONFIRMED").length,
    supplyCount: e.supplies.length,
    openTaskCount: e.tasks.filter((t) => !t.done).length
  }));

  // "Past" is about the calendar, not the status — a canceled future event still
  // shows up top so it does not silently vanish from the plan.
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  const isPast = (e: EventListItem) => new Date(e.endsAt ?? e.startsAt) < cutoff || e.status === "COMPLETE";

  return {
    upcoming: items.filter((e) => !isPast(e)),
    past: items.filter(isPast).reverse()
  };
}

/** The people who can own or staff an event: current staff, contractors included. */
export async function getEventRoster(): Promise<PersonRef[]> {
  return prisma.newHire.findMany({
    where: { stage: { in: ["ACTIVE", "POST_ONBOARD"] }, employmentStatus: { not: "TERMINATED" } },
    select: { id: true, name: true, position: true },
    orderBy: { name: "asc" }
  });
}

export async function getEventDetail(id: string): Promise<EventDetail | null> {
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true } },
      attendees: {
        include: { newHire: { select: { id: true, name: true, position: true } } },
        orderBy: { createdAt: "asc" }
      },
      supplies: {
        include: { supplyItem: { select: { onHand: true } } },
        orderBy: { createdAt: "asc" }
      },
      tasks: { orderBy: [{ done: "asc" }, { dueAt: "asc" }, { createdAt: "asc" }] }
    }
  });
  if (!event) return null;

  const takenIds = new Set(event.attendees.map((a) => a.newHireId));
  const [roster, stockRoom] = await Promise.all([
    getEventRoster(),
    prisma.supplyItem.findMany({
      where: { active: true },
      select: { id: true, name: true, unit: true, onHand: true },
      orderBy: { name: "asc" }
    })
  ]);

  return {
    id: event.id,
    name: event.name,
    type: event.type,
    status: event.status,
    startsAt: event.startsAt.toISOString(),
    endsAt: iso(event.endsAt),
    venue: event.venue,
    city: event.city,
    state: event.state,
    website: event.website,
    ownerId: event.ownerId,
    ownerName: event.owner ? personName(event.owner) : null,
    budget: event.budget,
    notes: event.notes,
    attendees: event.attendees.map((a) => ({
      id: a.id,
      newHireId: a.newHireId,
      name: a.newHire.name,
      position: a.newHire.position,
      status: a.status,
      role: a.role
    })),
    supplies: event.supplies.map((s) => ({
      id: s.id,
      supplyItemId: s.supplyItemId,
      label: s.label,
      quantity: s.quantity,
      packed: s.packed,
      onHand: s.supplyItem?.onHand ?? null,
      short: s.supplyItem ? s.quantity > s.supplyItem.onHand : false
    })),
    tasks: event.tasks.map((t) => ({
      id: t.id,
      label: t.label,
      owner: t.owner,
      dueAt: iso(t.dueAt),
      done: t.done
    })),
    roster: roster.filter((p) => !takenIds.has(p.id)),
    stockRoom
  };
}

/**
 * The stock room with the reorder maths done. Committed counts only lines on
 * events that have not happened yet and are not canceled — a completed event
 * has already taken its boxes, and a canceled one gives them back.
 */
export async function getSupplyItems(): Promise<SupplyItemView[]> {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);

  const items = await prisma.supplyItem.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: {
      eventSupplies: {
        where: {
          packed: false,
          event: { status: { in: OPEN_EVENT_STATUSES }, startsAt: { gte: cutoff } }
        },
        include: { event: { select: { id: true, name: true, startsAt: true } } }
      }
    }
  });

  return items.map((item) => {
    const committed = item.eventSupplies.reduce((sum, line) => sum + line.quantity, 0);
    const projected = item.onHand - committed;
    return {
      id: item.id,
      name: item.name,
      category: item.category,
      unit: item.unit,
      onHand: item.onHand,
      reorderThreshold: item.reorderThreshold,
      vendor: item.vendor,
      reorderUrl: item.reorderUrl,
      unitCost: item.unitCost,
      notes: item.notes,
      active: item.active,
      committed,
      projected,
      state: stockState(projected, item.reorderThreshold),
      claims: item.eventSupplies.map((line) => ({
        eventId: line.event.id,
        eventName: line.event.name,
        startsAt: line.event.startsAt.toISOString(),
        quantity: line.quantity
      }))
    };
  });
}

/** Count of items needing a reorder — drives the badge on the Events header. */
export async function getReorderCount(): Promise<number> {
  const items = await getSupplyItems();
  return items.filter((i) => i.active && i.state !== "OK").length;
}
