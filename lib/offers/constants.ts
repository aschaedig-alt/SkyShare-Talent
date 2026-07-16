// Offers — shared option list and helpers. Stored as a String column (repo
// convention), with this as the source of truth.
//
// Deliberately NO "verbal" state: an offer can be sent AND agreed verbally at the
// same moment, so as a status it would fight SENT. These four are mutually
// exclusive, which is what a status has to be. Record a verbal yes as a note or
// use the signed date once it is real.

export const OFFER_STATUSES = [
  { value: "NONE", label: "No offer" },
  { value: "PLANNED", label: "Offer planned" },
  { value: "SENT", label: "Offer sent" },
  { value: "SIGNED", label: "Offer signed" },
  { value: "DECLINED", label: "Offer declined" }
] as const;

// Where a transition came from. MANUAL is someone ticking it in the app; FRONT is
// an inbound Paycom notification arriving through Front; PAYCOM is a direct feed.
export const OFFER_SOURCES = ["MANUAL", "FRONT", "PAYCOM"] as const;

export type OfferStatus = (typeof OFFER_STATUSES)[number]["value"];
export type OfferSource = (typeof OFFER_SOURCES)[number];

export const offerStatusLabel = (v: string | null | undefined) =>
  OFFER_STATUSES.find((o) => o.value === v)?.label ?? v ?? "";

export function isOfferStatus(v: unknown): v is OfferStatus {
  return typeof v === "string" && OFFER_STATUSES.some((s) => s.value === v);
}
export function isOfferSource(v: unknown): v is OfferSource {
  return typeof v === "string" && (OFFER_SOURCES as readonly string[]).includes(v);
}

/** An offer that is out and awaiting an answer. */
export const isOfferOutstanding = (v: string | null | undefined) => v === "SENT";
/** They are in. This is the handoff moment from recruiting to onboarding. */
export const isOfferSigned = (v: string | null | undefined) => v === "SIGNED";
