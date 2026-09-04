import { prisma } from "@/lib/prisma";
import { candidateFieldScopeWhere, type CandidateAccessScope } from "@/lib/auth/candidate-scope";

export type OfferRow = {
  applicationId: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string | null;
  jobTitle: string | null;
  jobId: string | null;
  status: string;
  sentAt: string | null;
  signedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  /** Stopped on our side, never sent — NOT the same as declined. */
  notSentAt: string | null;
  notSentReason: string | null;
  startDate: string | null;
  source: string | null;
  /** Set once they have been moved into onboarding. */
  hireId: string | null;
};

export type OffersBoard = {
  rows: OfferRow[];
  counts: { planned: number; started: number; sent: number; signed: number; declined: number; notSent: number };
  /** Signed but not yet moved into onboarding — the list that actually needs doing. */
  awaitingOnboarding: number;
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

// Outstanding work first: an offer that is out is the one you are waiting on,
// and a signed offer that has not been onboarded is the one you are late on.
// Started/planned are still in your court, so they sit below the sent/signed ones.
// Offers that ended sort last — they are the record, not the work.
const ORDER: Record<string, number> = { SENT: 0, SIGNED: 1, STARTED: 2, PLANNED: 3, DECLINED: 4, NOT_SENT: 5 };

// viewer is REQUIRED. Offers ride on the CANDIDATES module (see app/offers/page.tsx),
// which is precisely the module a hand-picked hiring manager has switched ON - so this
// board is reachable by the one account the allowlist exists to contain, and it carries
// every candidate's name, email, job title, offer status and decline reason. Making the
// parameter required rather than optional is deliberate: an optional viewer defaulting to
// "unrestricted" is how this surface came to be missed in the first place.
export async function getOffersBoard(viewer: CandidateAccessScope | null): Promise<OffersBoard> {
  const scope = candidateFieldScopeWhere(viewer);
  const apps = await prisma.candidateApplication.findMany({
    // Null for anyone not allowlist-scoped, leaving the clause exactly as it was.
    where: scope
      ? { AND: [{ offerStatus: { not: "NONE" } }, scope] }
      : { offerStatus: { not: "NONE" } },
    select: {
      id: true,
      offerStatus: true,
      offerSentAt: true,
      offerSignedAt: true,
      offerDeclinedAt: true,
      offerDeclineReason: true,
      offerNotSentAt: true,
      offerNotSentReason: true,
      offerStartDate: true,
      offerSource: true,
      candidateId: true,
      candidate: { select: { id: true, displayName: true, primaryEmail: true } },
      job: { select: { id: true, title: true } }
    }
  });

  // Which of these people already have an onboarding record?
  const candidateIds = [...new Set(apps.map((a) => a.candidateId))];
  const hires = candidateIds.length
    ? await prisma.newHire.findMany({
        where: { candidateId: { in: candidateIds } },
        select: { id: true, candidateId: true }
      })
    : [];
  const hireByCandidate = new Map(hires.map((h) => [h.candidateId!, h.id]));

  const rows: OfferRow[] = apps
    .map((a) => ({
      applicationId: a.id,
      candidateId: a.candidateId,
      candidateName: a.candidate?.displayName ?? "Unnamed",
      candidateEmail: a.candidate?.primaryEmail ?? null,
      jobTitle: a.job?.title ?? null,
      jobId: a.job?.id ?? null,
      status: a.offerStatus,
      sentAt: iso(a.offerSentAt),
      signedAt: iso(a.offerSignedAt),
      declinedAt: iso(a.offerDeclinedAt),
      declineReason: a.offerDeclineReason,
      notSentAt: iso(a.offerNotSentAt),
      notSentReason: a.offerNotSentReason,
      startDate: iso(a.offerStartDate),
      source: a.offerSource,
      hireId: hireByCandidate.get(a.candidateId) ?? null
    }))
    .sort((x, y) => {
      const byStatus = (ORDER[x.status] ?? 9) - (ORDER[y.status] ?? 9);
      if (byStatus !== 0) return byStatus;
      // Then soonest start first, then most recent activity.
      const xs = x.startDate ?? x.signedAt ?? x.sentAt ?? "";
      const ys = y.startDate ?? y.signedAt ?? y.sentAt ?? "";
      return xs.localeCompare(ys);
    });

  const counts = {
    planned: rows.filter((r) => r.status === "PLANNED").length,
    started: rows.filter((r) => r.status === "STARTED").length,
    sent: rows.filter((r) => r.status === "SENT").length,
    signed: rows.filter((r) => r.status === "SIGNED").length,
    declined: rows.filter((r) => r.status === "DECLINED").length,
    notSent: rows.filter((r) => r.status === "NOT_SENT").length
  };

  return {
    rows,
    counts,
    awaitingOnboarding: rows.filter((r) => r.status === "SIGNED" && !r.hireId).length
  };
}
