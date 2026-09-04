import { prisma } from "@/lib/prisma";
import { recordOfferStatus } from "@/lib/offers/record-offer-status";
import { syncOfferStepToOnboarding } from "@/lib/offers/onboarding-sync";
import { isOfferClosed, type OfferStatus } from "@/lib/offers/constants";
import {
  deriveOfferStatus,
  parseOfferSteps,
  serializeOfferSteps,
  type OfferStepKey,
  type OfferSteps
} from "@/lib/offers/steps";

/**
 * Tick (or untick) one offer step, and let the offer's STATUS follow from it.
 *
 * The steps are what a recruiter actually does; the status is a summary. So this
 * writes the step, derives the status, and hands that to recordOfferStatus —
 * which remains the one place status changes, so the timeline entry, the audit
 * log and every downstream behaviour keep working exactly as they do for a
 * Paycom notification arriving via Front.
 */
export type OfferStepResult = {
  ok: boolean;
  message?: string;
  steps?: OfferSteps;
  status?: string;
};

export async function recordOfferStep(
  applicationId: string,
  key: OfferStepKey,
  done: boolean,
  actor?: { id?: string | null; email?: string | null }
): Promise<OfferStepResult> {
  const app = await prisma.candidateApplication.findUnique({
    where: { id: applicationId },
    select: { id: true, candidateId: true, offerStatus: true, offerStepsJson: true }
  });
  if (!app) return { ok: false, message: "Application not found." };

  const steps = parseOfferSteps(app.offerStepsJson);
  const at = new Date();
  if (done) steps[key] = at.toISOString();
  else delete steps[key];

  await prisma.candidateApplication.update({
    where: { id: applicationId },
    data: { offerStepsJson: serializeOfferSteps(steps) }
  });

  // Keep the linked hire's onboarding OFFER task in step (no-op if not moved in
  // yet). Done for every offer-step write, whatever the resulting status — so this
  // runs before the closed-offer short-circuit below.
  await syncOfferStepToOnboarding(app.candidateId, key, done, at);

  // A closed offer stays closed until somebody says otherwise. Neither ending is
  // derivable from our steps — a decline is something THEY did, and "not sent" is
  // the absence of a step rather than the presence of one — so neither may be
  // silently undone by someone tidying up a checkbox afterwards. That tidying is
  // exactly what happens to a dead offer: people go back and tick what really did
  // occur (the verbal, the draft) for the record, and it must not resurrect the
  // offer. Re-opening one is an explicit choice, made with the status control.
  if (isOfferClosed(app.offerStatus)) {
    return { ok: true, steps, status: app.offerStatus };
  }

  // An offer you have already opened should not silently vanish to "no offer"
  // just because you cleared its steps — you still decided to offer. So once an
  // offer exists, clearing every step floors it at PLANNED, not NONE. Going all
  // the way back to NONE is the explicit "No offer" choice on the status control.
  let status: OfferStatus = deriveOfferStatus(steps);
  if (status === "NONE" && app.offerStatus !== "NONE" && !isOfferClosed(app.offerStatus)) {
    status = "PLANNED";
  }
  const result = await recordOfferStatus(applicationId, {
    status,
    at,
    source: "MANUAL",
    actor
  });
  if (!result.ok) return { ok: false, message: result.message, steps };

  return { ok: true, steps, status };
}
