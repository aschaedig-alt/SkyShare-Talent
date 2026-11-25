// Events & Outreach — shared option lists and helpers. Statuses/types are stored
// as String columns (repo convention), with these as the source of truth.

export const EVENT_TYPES = [
  { value: "CAREER_FAIR", label: "Career fair" },
  { value: "SCHOOL", label: "School visit" },
  { value: "CONFERENCE", label: "Conference" },
  { value: "COMMUNITY", label: "Community" },
  { value: "AIRSHOW", label: "Airshow" },
  { value: "OTHER", label: "Other" }
] as const;

// Types for an INTERNAL event (Nov 25 2026). EVENT_TYPES above are the external
// (recruiting) ones; "Other" is in both.
export const INTERNAL_EVENT_TYPES = [
  { value: "HOLIDAY_PARTY", label: "Holiday party" },
  { value: "TEAM_EVENT", label: "Team event" },
  { value: "COMPANY_MEETING", label: "Company meeting" },
  { value: "TRAINING", label: "Training" },
  { value: "OTHER", label: "Other" }
] as const;

export type EventType = (typeof EVENT_TYPES)[number]["value"] | (typeof INTERNAL_EVENT_TYPES)[number]["value"];

// Who an event is for (Aimee, Nov 25 2026). EXTERNAL = recruiting: Recruiting >
// Career Fairs at /events. INTERNAL = our own people: People > Company Events at
// /company-events, with tabs and activities.
export const EVENT_AUDIENCES = [
  { value: "EXTERNAL", label: "External", hint: "Recruiting: we go out to meet people." },
  { value: "INTERNAL", label: "Internal", hint: "For our own people." }
] as const;

export type EventAudience = (typeof EVENT_AUDIENCES)[number]["value"];

export function isEventAudience(v: unknown): v is EventAudience {
  return v === "EXTERNAL" || v === "INTERNAL";
}

/** The types offered for an audience. */
export const typesFor = (audience: EventAudience) => (audience === "INTERNAL" ? INTERNAL_EVENT_TYPES : EVENT_TYPES);

/** Where an event's list lives, and its own page: the two homes. */
export const eventsHomeFor = (audience: string | null | undefined) => (audience === "INTERNAL" ? "/company-events" : "/events");
export const eventHref = (e: { id: string; audience?: string | null }) => `${eventsHomeFor(e.audience)}/${e.id}`;
export const eventsHomeLabel = (audience: string | null | undefined) =>
  audience === "INTERNAL" ? "Company Events" : "Career Fairs";

// Something people do at an internal event. IDEA is where a suggestion starts.
export const ACTIVITY_STATUSES = [
  { value: "IDEA", label: "Idea" },
  { value: "PLANNED", label: "Planned" },
  { value: "READY", label: "Ready" },
  { value: "DROPPED", label: "Dropped" }
] as const;

export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number]["value"];

export function isActivityStatus(v: unknown): v is ActivityStatus {
  return typeof v === "string" && ACTIVITY_STATUSES.some((o) => o.value === v);
}

// A company event's tabs (Nov 25 2026), each a ?tab= link. A career fair has none.
// Here rather than in the page component so the server page can read it too.
export const EVENT_TABS = [
  { key: "overview", label: "Overview" },
  { key: "guests", label: "Guests" },
  { key: "todos", label: "To-dos" },
  { key: "store", label: "Party store" },
  { key: "activities", label: "Activities" }
] as const;
export type EventTab = (typeof EVENT_TABS)[number]["key"];
export const isEventTab = (v: unknown): v is EventTab => EVENT_TABS.some((t) => t.key === v);

export const ACTIVITY_KINDS = ["CUSTOM", "SCAVENGER_HUNT"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

// PENDING leads the list because it is where an event begins when it arrives as
// an invitation: on the calendar so it cannot be forgotten, but explicitly not a
// commitment. Everything else is unchanged.
export const EVENT_STATUSES = [
  { value: "PENDING", label: "Pending decision" },
  { value: "PLANNED", label: "Planned" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "COMPLETE", label: "Complete" },
  { value: "CANCELED", label: "Canceled" }
] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number]["value"];

/**
 * Whether we are taking an aircraft — tracked separately from the event status
 * because it moves on its own schedule and has its own lead time (organizer
 * notice, ramp space, air-stairs/GPU, and a crew). UNDECIDED is the default so a
 * newly-added event honestly reads "nobody has decided yet" rather than "no".
 */
export const AIRCRAFT_PLANS = [
  { value: "UNDECIDED", label: "Not decided" },
  { value: "NOT_BRINGING", label: "Not bringing one" },
  { value: "REQUESTED", label: "Requested" },
  { value: "CONFIRMED", label: "Confirmed" }
] as const;

export type AircraftPlan = (typeof AIRCRAFT_PLANS)[number]["value"];

export const ATTENDEE_STATUSES = [
  { value: "PENDING", label: "Pending" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "DECLINED", label: "Declined" }
] as const;

export type AttendeeStatus = (typeof ATTENDEE_STATUSES)[number]["value"];

export const SUPPLY_CATEGORIES = [
  { value: "SWAG", label: "Swag" },
  { value: "PRINT", label: "Print" },
  { value: "BOOTH", label: "Booth" },
  { value: "APPAREL", label: "Apparel" },
  { value: "OTHER", label: "Other" }
] as const;

export type SupplyCategory = (typeof SUPPLY_CATEGORIES)[number]["value"];

// Where a planning to-do stands (Nov 24 2026, for party planning). EventTask.done
// is kept in step: done is true exactly when the status is DONE.
export const TASK_STATUSES = [
  { value: "TODO", label: "Not started" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "BLOCKED", label: "Waiting / blocked" },
  { value: "DONE", label: "Done" }
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number]["value"];

export function isTaskStatus(v: unknown): v is TaskStatus {
  return typeof v === "string" && TASK_STATUSES.some((o) => o.value === v);
}

/** Rows written before status existed carry only done; read those as DONE. */
export function effectiveTaskStatus(t: { status: string | null; done: boolean }): TaskStatus {
  if (t.done) return "DONE";
  return isTaskStatus(t.status) && t.status !== "DONE" ? t.status : "TODO";
}

export const taskStatusLabel = (v: string | null | undefined) =>
  TASK_STATUSES.find((o) => o.value === v)?.label ?? v ?? "—";

// An event still on the calendar — the ones that hold supplies and need people.
//
// PENDING is deliberately NOT here. An invitation we have not accepted must not
// reserve stock: if it did, three unanswered conference emails could show the
// cupboard as empty and trigger a reorder for events we never attend. Accepting
// one (PENDING -> PLANNED) is what makes its claim real.
export const OPEN_EVENT_STATUSES: EventStatus[] = ["PLANNED", "CONFIRMED"];

function labelFrom(list: readonly { value: string; label: string }[], value: string | null | undefined) {
  return list.find((o) => o.value === value)?.label ?? value ?? "—";
}

export const eventTypeLabel = (v: string | null | undefined) => labelFrom([...EVENT_TYPES, ...INTERNAL_EVENT_TYPES], v);
export const activityStatusLabel = (v: string | null | undefined) => labelFrom(ACTIVITY_STATUSES, v);
export const eventStatusLabel = (v: string | null | undefined) => labelFrom(EVENT_STATUSES, v);
export const aircraftPlanLabel = (v: string | null | undefined) => labelFrom(AIRCRAFT_PLANS, v);
export const attendeeStatusLabel = (v: string | null | undefined) => labelFrom(ATTENDEE_STATUSES, v);
export const supplyCategoryLabel = (v: string | null | undefined) => labelFrom(SUPPLY_CATEGORIES, v);

export function isEventType(v: unknown): v is EventType {
  return typeof v === "string" && [...EVENT_TYPES, ...INTERNAL_EVENT_TYPES].some((o) => o.value === v);
}

export function isEventStatus(v: unknown): v is EventStatus {
  return typeof v === "string" && EVENT_STATUSES.some((o) => o.value === v);
}

export function isAircraftPlan(v: unknown): v is AircraftPlan {
  return typeof v === "string" && AIRCRAFT_PLANS.some((o) => o.value === v);
}

export function isAttendeeStatus(v: unknown): v is AttendeeStatus {
  return typeof v === "string" && ATTENDEE_STATUSES.some((o) => o.value === v);
}

export function isSupplyCategory(v: unknown): v is SupplyCategory {
  return typeof v === "string" && SUPPLY_CATEGORIES.some((o) => o.value === v);
}

/**
 * Stock health for one supply item. "Committed" is what upcoming events have
 * claimed but not yet taken out of the cupboard, so projected is what is really
 * free. Reordering off on-hand alone is how you end up short at the next fair.
 */
export type StockState = "OK" | "LOW" | "OUT";

export function stockState(projected: number, reorderThreshold: number): StockState {
  if (projected <= 0) return "OUT";
  if (projected <= reorderThreshold) return "LOW";
  return "OK";
}
