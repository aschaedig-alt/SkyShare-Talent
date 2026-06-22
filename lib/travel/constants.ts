// Travel & logistics — shared option lists and helpers. Statuses/types are
// stored as String columns (repo convention), with these as the source of truth.

export const TRAVEL_PURPOSES = [
  { value: "ORIENTATION", label: "Orientation" },
  { value: "INDOC", label: "Indoc" },
  { value: "TRAINING", label: "Training" },
  { value: "INTERVIEW", label: "Interview" },
  { value: "RECRUITING_VISIT", label: "Recruiting visit" },
  { value: "OTHER", label: "Other" }
] as const;

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

export type TravelPurpose = (typeof TRAVEL_PURPOSES)[number]["value"];
export type TravelStatus = (typeof TRAVEL_STATUSES)[number]["value"];
export type TravelItemType = (typeof TRAVEL_ITEM_TYPES)[number]["value"];

const labelFrom = (
  list: readonly { value: string; label: string }[],
  value: string | null | undefined
) => list.find((o) => o.value === value)?.label ?? value ?? "";

export const travelPurposeLabel = (v: string | null | undefined) => labelFrom(TRAVEL_PURPOSES, v);
export const travelStatusLabel = (v: string | null | undefined) => labelFrom(TRAVEL_STATUSES, v);
export const travelItemTypeLabel = (v: string | null | undefined) => labelFrom(TRAVEL_ITEM_TYPES, v);

export function isTravelStatus(v: unknown): v is TravelStatus {
  return typeof v === "string" && TRAVEL_STATUSES.some((s) => s.value === v);
}
export function isTravelPurpose(v: unknown): v is TravelPurpose {
  return typeof v === "string" && TRAVEL_PURPOSES.some((s) => s.value === v);
}
export function isTravelItemType(v: unknown): v is TravelItemType {
  return typeof v === "string" && TRAVEL_ITEM_TYPES.some((s) => s.value === v);
}

export function formatUsd(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}
