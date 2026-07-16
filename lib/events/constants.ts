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

export type EventType = (typeof EVENT_TYPES)[number]["value"];

export const EVENT_STATUSES = [
  { value: "PLANNED", label: "Planned" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "COMPLETE", label: "Complete" },
  { value: "CANCELED", label: "Canceled" }
] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number]["value"];

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

// An event still on the calendar — the ones that hold supplies and need people.
export const OPEN_EVENT_STATUSES: EventStatus[] = ["PLANNED", "CONFIRMED"];

function labelFrom(list: readonly { value: string; label: string }[], value: string | null | undefined) {
  return list.find((o) => o.value === value)?.label ?? value ?? "—";
}

export const eventTypeLabel = (v: string | null | undefined) => labelFrom(EVENT_TYPES, v);
export const eventStatusLabel = (v: string | null | undefined) => labelFrom(EVENT_STATUSES, v);
export const attendeeStatusLabel = (v: string | null | undefined) => labelFrom(ATTENDEE_STATUSES, v);
export const supplyCategoryLabel = (v: string | null | undefined) => labelFrom(SUPPLY_CATEGORIES, v);

export function isEventType(v: unknown): v is EventType {
  return typeof v === "string" && EVENT_TYPES.some((o) => o.value === v);
}

export function isEventStatus(v: unknown): v is EventStatus {
  return typeof v === "string" && EVENT_STATUSES.some((o) => o.value === v);
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
