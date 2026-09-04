// Offers — shared option list and helpers. Stored as a String column (repo
// convention), with this as the source of truth.
//
// Deliberately NO "verbal" state: an offer can be sent AND agreed verbally at the
// same moment, so as a status it would fight SENT. These are mutually exclusive,
// which is what a status has to be. Record a verbal yes with the "Verbal offer"
// STEP (lib/offers/steps.ts) — which is also what makes NOT_SENT legible: verbal
// ticked, letter never sent.

export const OFFER_STATUSES = [
  { value: "NONE", label: "No offer" },
  { value: "PLANNED", label: "Offer planned" },
  { value: "STARTED", label: "Offer started" },
  { value: "SENT", label: "Offer sent" },
  { value: "SIGNED", label: "Offer signed" },
  { value: "DECLINED", label: "Offer declined" },
  { value: "NOT_SENT", label: "Offer not sent" }
] as const;

/**
 * The two ways an offer ends without a hire, and they are NOT the same thing.
 *
 * DECLINED is the candidate's answer: we sent it, they said no.
 * NOT_SENT is ours: the offer was worked — sometimes as far as a verbal yes —
 * and then never went out, because the President did not approve it, the seat
 * was pulled, or the req was cancelled. The candidate did nothing; in most cases
 * they never even knew there was a letter to receive.
 *
 * They are split because the record outlives the memory of it. Filing a
 * non-approval under "declined" writes a rejection onto somebody who never
 * rejected us, and the next recruiter who opens that profile has no way to tell.
 * It also loses the only fact worth keeping for OUR side: the offer stalled
 * internally, at a step we can name.
 */
export const isOfferDeclinedByCandidate = (v: string | null | undefined) => v === "DECLINED";
export const isOfferStoppedInternally = (v: string | null | undefined) => v === "NOT_SENT";
/** Ended without a hire, either way — for "is this offer still live?" checks. */
export const isOfferClosed = (v: string | null | undefined) => v === "DECLINED" || v === "NOT_SENT";

// Where a transition came from. MANUAL is someone ticking it in the app; FRONT is
// an inbound Paycom notification arriving through Front; PAYCOM is a direct feed.
export const OFFER_SOURCES = ["MANUAL", "FRONT", "PAYCOM"] as const;

export type OfferStatus = (typeof OFFER_STATUSES)[number]["value"];
export type OfferSource = (typeof OFFER_SOURCES)[number];

export const offerStatusLabel = (v: string | null | undefined) =>
  OFFER_STATUSES.find((o) => o.value === v)?.label ?? v ?? "";

/**
 * Just the state word — "signed", "sent" — for use mid-sentence, where the full
 * label would stutter ("Offer is already offer signed").
 */
export const offerStatusWord = (v: string | null | undefined) =>
  offerStatusLabel(v).replace(/^offer\s+/i, "").toLowerCase();

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
