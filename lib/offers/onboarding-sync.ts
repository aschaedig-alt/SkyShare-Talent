import { prisma } from "@/lib/prisma";
import { OFFER_STEP_KEYS, type OfferStepKey } from "@/lib/offers/steps";

// Keeps the offer's two faces in step: the 6 offer steps on the candidate's
// application (offerStepsJson) and the SAME 6 keys as the "OFFER" group of the
// linked new hire's onboarding checklist (OnboardingTask rows). They share keys
// exactly (lib/offers/steps.ts imports the labels from lib/onboarding/tasks.ts),
// so a step is a task and a task is a step — this module just mirrors the flag so
// the two can never drift after a candidate is moved into onboarding.

// Best-known ordering of an offer's progress, used to pick which application
// carries the offer when a candidate has more than one.
// DECLINED and NOT_SENT share the bottom rung above NONE: both are offers that
// ended, so neither should outrank one still in play, but both still beat an
// application that never had an offer at all.
const STATUS_RANK: Record<string, number> = { SIGNED: 5, SENT: 4, STARTED: 3, PLANNED: 2, DECLINED: 1, NOT_SENT: 1, NONE: 0 };

/**
 * The application that represents this candidate's offer — the furthest-along one
 * (ties broken by most-recently-updated). Mirrors how the move-to-onboarding path
 * picks the offer to carry over. Null if the candidate has no applications.
 */
export async function findOfferApplicationId(candidateId: string): Promise<string | null> {
  const apps = await prisma.candidateApplication.findMany({
    where: { candidateId },
    select: { id: true, offerStatus: true, updatedAt: true }
  });
  if (apps.length === 0) return null;
  apps.sort(
    (a, b) => (STATUS_RANK[b.offerStatus] ?? 0) - (STATUS_RANK[a.offerStatus] ?? 0) || b.updatedAt.getTime() - a.updatedAt.getTime()
  );
  return apps[0].id;
}

/**
 * Application → onboarding: mirror one offer step onto the linked hire's matching
 * OFFER onboarding task. Called from recordOfferStep, so EVERY offer-step write
 * (candidate Offers tab, onboarding write-back, a future Front/Paycom caller)
 * keeps the checklist in step. No-op when the candidate has no linked hire, or the
 * hire has no OFFER task rows yet (updateMany simply touches 0 rows) — so it is
 * safe for the ~legacy hires that were imported without a task list.
 */
export async function syncOfferStepToOnboarding(
  candidateId: string | null | undefined,
  key: OfferStepKey,
  done: boolean,
  at: Date
): Promise<void> {
  if (!candidateId) return;
  const hire = await prisma.newHire.findFirst({ where: { candidateId }, select: { id: true } });
  if (!hire) return;
  await prisma.onboardingTask.updateMany({
    where: { newHireId: hire.id, key },
    data: { status: done ? "DONE" : "TODO", completedAt: done ? at : null }
  });
}

/**
 * Onboarding → application: when an OFFER-group task is ticked on the onboarding
 * checklist, write it back to the offer on the candidate's application through the
 * audited recordOfferStep path (which stamps the status, dates, timeline + activity
 * log, and then re-mirrors to onboarding — a harmless idempotent write on the same
 * task). No-op if the hire isn't linked to a candidate, or the candidate has no
 * application to hold the offer.
 */
export async function syncOnboardingTaskToOffer(
  newHireId: string,
  key: OfferStepKey,
  done: boolean,
  actor?: { id?: string | null; email?: string | null }
): Promise<void> {
  const hire = await prisma.newHire.findUnique({ where: { id: newHireId }, select: { candidateId: true } });
  if (!hire?.candidateId) return;
  const applicationId = await findOfferApplicationId(hire.candidateId);
  if (!applicationId) return;
  // Imported lazily to avoid a module cycle (record-offer-step imports this file).
  const { recordOfferStep } = await import("@/lib/offers/record-offer-step");
  await recordOfferStep(applicationId, key, done, actor);
}

export { OFFER_STEP_KEYS };
