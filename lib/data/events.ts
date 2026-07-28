import { prisma } from "@/lib/prisma";
import { OPEN_EVENT_STATUSES, isEventType, stockState, type StockState } from "@/lib/events/constants";
import type { ExtractedEvent } from "@/lib/events/event-email-ai";

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
  aircraftPlan: string;
  aircraftTail: string | null;
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

export type PersonRef = {
  id: string;
  name: string;
  position: string | null;
  /**
   * Department, for the attendee picker's filter. The roster is 400+ people and
   * an unfiltered dropdown of that length is unusable — see getEventRoster.
   */
  department: string | null;
  location: string | null;
};

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
  aircraftPlan: string;
  aircraftTail: string | null;
  aircraftNotes: string | null;
  sourceConversationId: string | null;
  sourceEmailUrl: string | null;
  sourceSubject: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  shipToAddress: string | null;
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
    openTaskCount: e.tasks.filter((t) => !t.done).length,
    aircraftPlan: e.aircraftPlan,
    aircraftTail: e.aircraftTail
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

/**
 * The people who can own or staff an event: current staff, contractors included.
 *
 * These are EMPLOYEES, not candidates — the whole current roster, which is why
 * department and location come along. The people who work an event are a mixed
 * bag (pilots, maintenance, recruiting, an exec) drawn from several hundred
 * names, so the picker filters by department rather than scrolling one list.
 *
 * ARCHIVED is deliberately included alongside ACTIVE and POST_ONBOARD: archiving
 * is an onboarding-lifecycle state meaning "we are finished onboarding them",
 * not "they have left" — leaving is employmentStatus TERMINATED, which is what
 * is actually excluded here. Filtering on stage alone hid most of the company.
 */
export async function getEventRoster(): Promise<PersonRef[]> {
  return prisma.newHire.findMany({
    where: {
      stage: { in: ["ACTIVE", "POST_ONBOARD", "ARCHIVED"] },
      employmentStatus: { not: "TERMINATED" },
      canceled: false
    },
    select: { id: true, name: true, position: true, department: true, location: true },
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
    aircraftPlan: event.aircraftPlan,
    aircraftTail: event.aircraftTail,
    aircraftNotes: event.aircraftNotes,
    sourceConversationId: event.sourceConversationId,
    sourceEmailUrl: event.sourceEmailUrl,
    sourceSubject: event.sourceSubject,
    contactName: event.contactName,
    contactEmail: event.contactEmail,
    contactPhone: event.contactPhone,
    shipToAddress: event.shipToAddress,
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

// ---------------------------------------------------------------------------
// Events that arrive by email
// ---------------------------------------------------------------------------

export type EventDraftInput = Pick<
  ExtractedEvent,
  | "name"
  | "type"
  | "startsAt"
  | "endsAt"
  | "venue"
  | "city"
  | "state"
  | "website"
  | "contactName"
  | "contactEmail"
  | "contactPhone"
  | "shipToAddress"
  | "notes"
  | "aircraftMentioned"
>;

export type LeadSource = {
  conversationId: string;
  frontUrl: string;
  subject: string;
};

/**
 * Create an event from a reviewed email draft.
 *
 * Always lands as PENDING — an invitation that arrived is not a decision to go,
 * and the whole point of importing it is to be able to make that decision later
 * with the details already captured.
 *
 * When the email mentioned a static display, the aircraft question is opened
 * rather than answered: the plan stays UNDECIDED and the organizer's own words
 * are kept in aircraftNotes, so whoever decides can see what was actually
 * offered instead of taking our summary on trust.
 *
 * The conversation id is stored, which is also what stops a re-scan offering the
 * same email again. A unique-constraint collision means someone imported it in
 * the meantime; that returns the existing event rather than failing, since the
 * user's intent — "this email should be on the calendar" — is already satisfied.
 */
export async function importEventFromLead(
  draft: EventDraftInput,
  source: LeadSource | null
): Promise<{ id: string; alreadyExisted: boolean }> {
  if (source) {
    const existing = await prisma.event.findFirst({
      where: { sourceConversationId: source.conversationId },
      select: { id: true }
    });
    if (existing) return { id: existing.id, alreadyExisted: true };
  }

  const startsAt = draft.startsAt ? new Date(draft.startsAt) : null;
  if (!startsAt || Number.isNaN(startsAt.getTime())) {
    throw new Error("An event needs a start date.");
  }
  const endsAt = draft.endsAt ? new Date(draft.endsAt) : null;

  const aircraftNotes = draft.aircraftMentioned
    ? "The invitation mentions a static display / aircraft on the ramp — decide whether we are taking one."
    : null;

  try {
    const event = await prisma.event.create({
      data: {
        name: draft.name?.trim() || source?.subject?.trim() || "Untitled event",
        type: isEventType(draft.type) ? draft.type : "CAREER_FAIR",
        status: "PENDING",
        startsAt,
        endsAt: endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : null,
        venue: draft.venue?.trim() || null,
        city: draft.city?.trim() || null,
        state: draft.state?.trim() || null,
        website: draft.website?.trim() || null,
        notes: draft.notes?.trim() || null,
        aircraftPlan: "UNDECIDED",
        aircraftNotes,
        contactName: draft.contactName?.trim() || null,
        contactEmail: draft.contactEmail?.trim() || null,
        contactPhone: draft.contactPhone?.trim() || null,
        shipToAddress: draft.shipToAddress?.trim() || null,
        sourceConversationId: source?.conversationId ?? null,
        sourceEmailUrl: source?.frontUrl ?? null,
        sourceSubject: source?.subject ?? null
      },
      select: { id: true }
    });
    return { id: event.id, alreadyExisted: false };
  } catch (error) {
    // Lost a race on the unique conversation id — treat it as already imported.
    if (source) {
      const existing = await prisma.event.findFirst({
        where: { sourceConversationId: source.conversationId },
        select: { id: true }
      });
      if (existing) return { id: existing.id, alreadyExisted: true };
    }
    throw error;
  }
}

/** "No thanks" — keep this email out of future scans. Reversible. */
export async function skipEventLead(
  conversationId: string,
  subject: string | null,
  skippedBy: string | null
): Promise<void> {
  await prisma.eventLeadSkip.upsert({
    where: { conversationId },
    create: { conversationId, subject, skippedBy },
    update: { subject, skippedBy }
  });
}

/** Put a skipped email back in the scan. */
export async function unskipEventLead(conversationId: string): Promise<void> {
  await prisma.eventLeadSkip.deleteMany({ where: { conversationId } });
}

export type SkippedLead = {
  conversationId: string;
  subject: string | null;
  skippedBy: string | null;
  createdAt: string;
  frontUrl: string;
};

/** Everything you have passed on — the "see it and undo it" half of the skip list. */
export async function getSkippedLeads(): Promise<SkippedLead[]> {
  const rows = await prisma.eventLeadSkip.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map((r) => ({
    conversationId: r.conversationId,
    subject: r.subject,
    skippedBy: r.skippedBy,
    createdAt: r.createdAt.toISOString(),
    frontUrl: `https://app.frontapp.com/open/${r.conversationId}`
  }));
}

/**
 * Every event with a date, for the calendar. Deliberately unfiltered by status:
 * a canceled event still occupied a weekend someone planned around, and hiding
 * it makes the calendar lie about the past.
 */
export type CalendarEvent = {
  id: string;
  name: string;
  type: string;
  status: string;
  startsAt: string;
  endsAt: string | null;
  city: string | null;
  state: string | null;
  venue: string | null;
  aircraftPlan: string;
  attendeeCount: number;
};

export async function getEventCalendar(): Promise<CalendarEvent[]> {
  const rows = await prisma.event.findMany({
    orderBy: { startsAt: "asc" },
    include: { attendees: { select: { id: true } } }
  });
  return rows.map((e) => ({
    id: e.id,
    name: e.name,
    type: e.type,
    status: e.status,
    startsAt: e.startsAt.toISOString(),
    endsAt: iso(e.endsAt),
    city: e.city,
    state: e.state,
    venue: e.venue,
    aircraftPlan: e.aircraftPlan,
    attendeeCount: e.attendees.length
  }));
}
