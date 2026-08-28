// Travel & logistics — shared option lists and helpers. Statuses/types are
// stored as String columns (repo convention), with these as the source of truth.

// INTERVIEW was removed Jul 31: an interview trip and a recruiting visit are the
// same visit with the same logistics, and keeping both meant choosing between two
// options that behave identically. No data moved — zero trips had used INTERVIEW.
// Anything arriving as INTERVIEW (an old row, or the email parser) is normalized
// to RECRUITING_VISIT on the way in; see normalizeTravelPurpose below.
export const TRAVEL_PURPOSES = [
  { value: "ORIENTATION", label: "Orientation" },
  { value: "INDOC", label: "Indoc" },
  { value: "TRAINING", label: "Training" },
  { value: "CREW", label: "Crew travel" },
  { value: "RECRUITING_VISIT", label: "Recruiting visit" },
  { value: "OTHER", label: "Other" }
] as const;

/**
 * The purposes that mean "this person is travelling because we are onboarding
 * them", and therefore the only ones allowed to tick the onboarding checklist's
 * travel_complete. See app/travel/actions.ts.
 *
 * WHY THIS EXISTS. That tick used to fire on ANY trip of a hire's reaching
 * BOOKED. It was harmless only by accident — the purposes that are not about
 * onboarding attach to a candidate, so they carried no newHireId to tick. CREW
 * breaks that accident: crew travel is booked for somebody who is already a
 * hire, so without this list, booking a pilot's line trip would mark their
 * orientation travel arranged. Verified against all 8 live trips before it
 * shipped: the four carrying a newHireId are ORIENTATION x3 and TRAINING, so no
 * existing row changes behaviour.
 */
export const ONBOARDING_TRAVEL_PURPOSES = ["ORIENTATION", "INDOC", "TRAINING"] as const;

/** Purposes no longer offered, kept so an old row still reads as words. */
const RETIRED_PURPOSE_LABELS: Record<string, string> = {
  INTERVIEW: "Recruiting visit"
};

/**
 * Fold a retired purpose onto its replacement. Applied wherever a purpose comes
 * from outside the picker — an imported email, or a row written before the list
 * changed — so nothing downstream has to know the old value existed.
 */
export function normalizeTravelPurpose(v: string | null | undefined): string {
  if (v === "INTERVIEW") return "RECRUITING_VISIT";
  return v ?? "OTHER";
}

export const TRAVEL_STATUSES = [
  { value: "NEEDED", label: "Needed" },
  { value: "BOOKED", label: "Booked" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELED", label: "Canceled" }
] as const;

export const TRAVEL_ITEM_TYPES = [
  { value: "FLIGHT", label: "Flight" },
  { value: "CAR", label: "Rental car" },
  { value: "HOTEL", label: "Hotel" },
  { value: "TRANSPORT", label: "Ground transport" },
  { value: "OTHER", label: "Other" }
] as const;

// Where a self-booked item stands: we owe them nothing, we owe them, or we paid
// them back. Only meaningful on items the traveller booked themselves.
export const TRAVEL_REIMBURSEMENTS = [
  { value: "NOT_NEEDED", label: "No reimbursement" },
  { value: "NEEDED", label: "Reimbursement owed" },
  { value: "REIMBURSED", label: "Reimbursed" }
] as const;

export type TravelPurpose = (typeof TRAVEL_PURPOSES)[number]["value"];
export type TravelStatus = (typeof TRAVEL_STATUSES)[number]["value"];
export type TravelItemType = (typeof TRAVEL_ITEM_TYPES)[number]["value"];
export type TravelReimbursement = (typeof TRAVEL_REIMBURSEMENTS)[number]["value"];

const labelFrom = (
  list: readonly { value: string; label: string }[],
  value: string | null | undefined
) => list.find((o) => o.value === value)?.label ?? value ?? "";

export const travelPurposeLabel = (v: string | null | undefined) =>
  RETIRED_PURPOSE_LABELS[v ?? ""] ?? labelFrom(TRAVEL_PURPOSES, v);
export const travelStatusLabel = (v: string | null | undefined) => labelFrom(TRAVEL_STATUSES, v);
export const travelItemTypeLabel = (v: string | null | undefined) => labelFrom(TRAVEL_ITEM_TYPES, v);
export const travelReimbursementLabel = (v: string | null | undefined) => labelFrom(TRAVEL_REIMBURSEMENTS, v);

export function isTravelStatus(v: unknown): v is TravelStatus {
  return typeof v === "string" && TRAVEL_STATUSES.some((s) => s.value === v);
}
export function isTravelPurpose(v: unknown): v is TravelPurpose {
  return typeof v === "string" && TRAVEL_PURPOSES.some((s) => s.value === v);
}
export function isTravelItemType(v: unknown): v is TravelItemType {
  return typeof v === "string" && TRAVEL_ITEM_TYPES.some((s) => s.value === v);
}
export function isTravelReimbursement(v: unknown): v is TravelReimbursement {
  return typeof v === "string" && TRAVEL_REIMBURSEMENTS.some((s) => s.value === v);
}

/**
 * Where somebody's travel actually lives: their own profile, on its Travel tab.
 *
 * The travel hub used to answer "show me this person" by loading them into a
 * pane at the BOTTOM of /travel. That was the wrong place — it put a profile
 * below a six-week calendar and a roll-up, so reaching it meant scrolling past
 * everything else, and it was a second, thinner copy of a page that already
 * exists. Every "open this person" on the hub is now a real link to the real
 * page, which also makes it ctrl-clickable into a new tab.
 *
 * `tripId` is passed when a specific TRIP was clicked — a calendar chip, a row
 * in the table — so the panel on the far side can open that one rather than
 * leaving somebody to find it among four.
 */
export function travelTabHref(profileHref: string, tripId?: string | null): string {
  const params = new URLSearchParams({ tab: "travel" });
  if (tripId) params.set("trip", tripId);
  return `${profileHref}?${params.toString()}`;
}

export function formatUsd(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}
