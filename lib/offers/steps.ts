// The offer, as the steps you actually take — not a status you remember to set.
//
// These are the SAME six keys and labels the onboarding checklist uses
// (lib/onboarding/tasks.ts, group OFFER). Deliberately not a parallel list: what
// gets ticked here before someone is a new hire carries over as those exact
// tasks, already complete, when they move into onboarding.
//
// Why they live on the application: making an offer is the last act of
// RECRUITING. Previously the only way to get these steps was to create a NewHire
// row, which is precisely what produced 448 hire records disconnected from the
// candidate they came from. You should be able to work an offer for someone you
// merely MIGHT hire.
//
// offerStatus is DERIVED from these (deriveOfferStatus). The steps are the source
// of truth; the status is a summary of them.

import { ONBOARDING_TASKS } from "@/lib/onboarding/tasks";
import type { OfferStatus } from "@/lib/offers/constants";

export const OFFER_STEP_KEYS = [
  "verbal_offer",
  "draft_offer",
  "supervisor_signs",
  "president_signs",
  "offer_letter_sent",
  "candidate_signed"
] as const;

export type OfferStepKey = (typeof OFFER_STEP_KEYS)[number];

/** Ticked steps: key → when it was ticked (ISO). Absent means not done. */
export type OfferSteps = Partial<Record<OfferStepKey, string>>;

export function isOfferStepKey(v: unknown): v is OfferStepKey {
  return typeof v === "string" && (OFFER_STEP_KEYS as readonly string[]).includes(v);
}

/**
 * Labels come from the onboarding checklist so the wording never drifts between
 * what you tick before the hire and what you see after it.
 */
export const OFFER_STEPS: Array<{ key: OfferStepKey; label: string }> = OFFER_STEP_KEYS.map((key) => ({
  key,
  label: ONBOARDING_TASKS.find((t) => t.key === key)?.label ?? key
}));

export function parseOfferSteps(json: string | null | undefined): OfferSteps {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: OfferSteps = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      // Ignore anything we don't recognise rather than trusting stored shape.
      if (isOfferStepKey(k) && typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeOfferSteps(steps: OfferSteps): string | null {
  const entries = Object.entries(steps).filter(([k, v]) => isOfferStepKey(k) && typeof v === "string");
  return entries.length ? JSON.stringify(Object.fromEntries(entries)) : null;
}

/**
 * The status these steps add up to.
 *
 * Signing is the handoff, so it wins outright. "Sent" means the letter is out and
 * waiting on them. Any of the prep steps before that — verbal, drafting, the
 * supervisor and president signatures — means the offer is under way but not yet
 * in the candidate's hands, which is "started". "Planned" is the step BEFORE any
 * of that: you have decided to offer but not begun, so it is not derived from a
 * step (there is none) — it is set explicitly (the "Start an offer" action).
 *
 * DECLINED is deliberately NOT derivable: declining is something THEY do, not a
 * step we take, so it stays an explicit action.
 */
export function deriveOfferStatus(steps: OfferSteps): Exclude<OfferStatus, "DECLINED" | "PLANNED"> {
  if (steps.candidate_signed) return "SIGNED";
  if (steps.offer_letter_sent) return "SENT";
  if (OFFER_STEP_KEYS.some((k) => steps[k])) return "STARTED";
  return "NONE";
}

/** When a step happened, for carrying the completion date onto the real task. */
export function offerStepCompletedAt(steps: OfferSteps, key: OfferStepKey): Date | null {
  const raw = steps[key];
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const offerStepsDone = (steps: OfferSteps) => OFFER_STEP_KEYS.filter((k) => Boolean(steps[k])).length;

// The offer fields the OfferControl stepper renders. Shared so the SAME stepper can
// be fed from either the candidate profile OR the onboarding record (a hire's linked
// offer) — the two are kept in step by the offer<->onboarding sync.
export type OfferApplicationView = {
  id: string;
  offerStatus: string;
  offerSteps: Record<string, string>;
  offerSentAt: string | null;
  offerSignedAt: string | null;
  offerDeclinedAt: string | null;
  offerDeclineReason: string | null;
  offerStartDate: string | null;
  offerSource: string | null;
};
