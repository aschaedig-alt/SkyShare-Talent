import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity/logger";
import { isOfferStatus, offerStatusLabel, type OfferSource, type OfferStatus } from "@/lib/offers/constants";

/**
 * THE one place an offer's state changes.
 *
 * Everything downstream of an offer (the prompt to move someone into onboarding,
 * travel, the checklist) reacts to the STATE this writes — never to whoever
 * caused it. That is the whole point: today the only caller is a person ticking a
 * box; later a Paycom "Offer Accepted" notification arriving via Front calls the
 * same function with source: "FRONT" and every downstream behaviour just works.
 *
 * So: do not put behaviour in the click handler. Put it here, or hang it off the
 * state. A caller should only ever have to say "this offer is signed, here is
 * when, here is how I know".
 */

export type OfferTransition = {
  status: OfferStatus;
  /** When it actually happened (not when we heard about it). Defaults to now. */
  at?: Date | null;
  /** How we know. MANUAL today; FRONT / PAYCOM once inbound email is wired. */
  source?: OfferSource;
  /** Why they declined — only meaningful with DECLINED. */
  reason?: string | null;
  /** The start date named on the offer, if there is one. */
  startDate?: Date | null;
  actor?: { id?: string | null; email?: string | null };
};

export type OfferResult = {
  ok: boolean;
  message?: string;
  /** false when the offer was already in this state — a safe no-op, not an error. */
  changed: boolean;
};

export async function recordOfferStatus(applicationId: string, t: OfferTransition): Promise<OfferResult> {
  if (!isOfferStatus(t.status)) {
    return { ok: false, changed: false, message: `Unknown offer status: ${String(t.status)}` };
  }

  const app = await prisma.candidateApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      candidateId: true,
      offerStatus: true,
      candidate: { select: { displayName: true } },
      job: { select: { title: true } }
    }
  });
  if (!app) return { ok: false, changed: false, message: "Application not found." };

  // Idempotent. A Paycom notification re-confirming an offer we already know
  // about must not re-fire the downstream work (or double-create a new hire).
  if (app.offerStatus === t.status) {
    return { ok: true, changed: false, message: `Offer is already ${offerStatusLabel(t.status).toLowerCase()}.` };
  }

  const when = t.at ?? new Date();
  const source = t.source ?? "MANUAL";

  const data: Record<string, unknown> = { offerStatus: t.status, offerSource: source };
  // Stamp the date belonging to this state. Earlier dates are left alone — they
  // are the offer's history (sent on the 3rd, signed on the 9th).
  if (t.status === "SENT") data.offerSentAt = when;
  if (t.status === "SIGNED") data.offerSignedAt = when;
  if (t.status === "DECLINED") {
    data.offerDeclinedAt = when;
    data.offerDeclineReason = t.reason?.trim() || null;
  }
  if (t.startDate !== undefined) data.offerStartDate = t.startDate;

  await prisma.candidateApplication.update({ where: { id: applicationId }, data });

  const who = app.candidate?.displayName ?? "Candidate";
  const role = app.job?.title ? ` — ${app.job.title}` : "";
  const label = offerStatusLabel(t.status);

  // Timeline entry so the offer shows in the candidate's history alongside their
  // applications and interviews, rather than only as a status chip.
  if (t.status !== "NONE") {
    await prisma.timelineEvent.create({
      data: {
        candidateId: app.candidateId,
        type: "OFFER",
        title: `${label}${role}`,
        detail: t.status === "DECLINED" && t.reason ? t.reason : source === "MANUAL" ? null : `via ${source}`,
        occurredAt: when,
        sourceType: "Application",
        sourceId: app.id
      }
    });
  }

  await logActivity({
    userId: t.actor?.id ?? undefined,
    userEmail: t.actor?.email ?? undefined,
    activityType: "OFFER_STATUS_CHANGED",
    description: `${label} for ${who}${role}`,
    entityType: "Candidate",
    entityId: app.candidateId,
    metadata: { applicationId, from: app.offerStatus, to: t.status, source, at: when.toISOString() }
  });

  return { ok: true, changed: true };
}
