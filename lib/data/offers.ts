import { prisma } from "@/lib/prisma";

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
  startDate: string | null;
  source: string | null;
  /** Set once they have been moved into onboarding. */
  hireId: string | null;
};

export type OffersBoard = {
  rows: OfferRow[];
  counts: { planned: number; started: number; sent: number; signed: number; declined: number };
  /** Signed but not yet moved into onboarding — the list that actually needs doing. */
  awaitingOnboarding: number;
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

// Outstanding work first: an offer that is out is the one you are waiting on,
// and a signed offer that has not been onboarded is the one you are late on.
// Started/planned are still in your court, so they sit below the sent/signed ones.
const ORDER: Record<string, number> = { SENT: 0, SIGNED: 1, STARTED: 2, PLANNED: 3, DECLINED: 4 };

export async function getOffersBoard(): Promise<OffersBoard> {
  const apps = await prisma.candidateApplication.findMany({
    where: { offerStatus: { not: "NONE" } },
    select: {
      id: true,
      offerStatus: true,
      offerSentAt: true,
      offerSignedAt: true,
      offerDeclinedAt: true,
      offerDeclineReason: true,
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
    declined: rows.filter((r) => r.status === "DECLINED").length
  };

  return {
    rows,
    counts,
    awaitingOnboarding: rows.filter((r) => r.status === "SIGNED" && !r.hireId).length
  };
}
