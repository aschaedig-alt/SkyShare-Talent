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
  { value: "RECRUITING_VISIT", label: "Recruiting visit" },
  { value: "OTHER", label: "Other" }
] as const;

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

export function formatUsd(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}
