import { prisma } from "@/lib/prisma";

export type DuplicateCandidateBrief = {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  counts: { files: number; notes: number; applications: number; interviews: number };
} | null;

export type DuplicateReviewData = {
  stats: {
    open: number;
    candidate: number;
    job: number;
    file: number;
    resolved: number;
  };
  items: Array<{
    id: string;
    reviewType: string;
    status: string;
    reason: string | null;
    confidence: string | null;
    createdAt: string;
    primary: DuplicateCandidateBrief;
    secondary: DuplicateCandidateBrief;
  }>;
  /**
   * Pairs that have been resolved or dismissed.
   *
   * These exist because the scan card counts EVERY pair it detected, while the
   * queue and all four stat tiles filter to OPEN — so the page could say "3
   * possible pairs" and then show nobody, with no way to find out who they were.
   * Reported by Hannah on 2026-08-31; all 44 review items were RESOLVED or
   * DISMISSED and there was no OPEN row anywhere, so the empty queue was correct
   * and the banner was the only thing counting something unreachable.
   */
  closed: Array<{
    id: string;
    reviewType: string;
    status: string;
    reason: string | null;
    confidence: string | null;
    createdAt: string;
    resolvedAt: string | null;
    primary: DuplicateCandidateBrief;
    secondary: DuplicateCandidateBrief;
  }>;
};

const candidateSelect = {
  select: {
    id: true,
    displayName: true,
    primaryEmail: true,
    primaryPhone: true,
    _count: { select: { files: true, notes: true, applications: true, interviews: true } }
  }
} as const;

type CandidateRow = {
  id: string;
  displayName: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  _count: { files: number; notes: number; applications: number; interviews: number };
};

function brief(c: CandidateRow | null): DuplicateCandidateBrief {
  if (!c) return null;
  return {
    id: c.id,
    displayName: c.displayName,
    email: c.primaryEmail,
    phone: c.primaryPhone,
    counts: {
      files: c._count.files,
      notes: c._count.notes,
      applications: c._count.applications,
      interviews: c._count.interviews
    }
  };
}

export async function getDuplicateReviewData(): Promise<DuplicateReviewData> {
  const [items, open, candidate, job, file, resolved, closedItems] = await Promise.all([
    // The queue shows OPEN items only — resolved/dismissed pairs drop off.
    prisma.duplicateReviewItem.findMany({
      where: { status: "OPEN" },
      take: 100,
      orderBy: { createdAt: "desc" },
      include: {
        primaryCandidate: candidateSelect,
        secondaryCandidate: candidateSelect
      }
    }),
    prisma.duplicateReviewItem.count({ where: { status: "OPEN" } }),
    prisma.duplicateReviewItem.count({ where: { status: "OPEN", reviewType: "CANDIDATE" } }),
    prisma.duplicateReviewItem.count({ where: { status: "OPEN", reviewType: "JOB" } }),
    prisma.duplicateReviewItem.count({ where: { status: "OPEN", reviewType: "FILE" } }),
    prisma.duplicateReviewItem.count({ where: { status: { not: "OPEN" } } }),
    // The closed pairs themselves, so the page can NAME what the scan counted
    // rather than reporting a number nothing renders.
    prisma.duplicateReviewItem.findMany({
      where: { status: { not: "OPEN" } },
      take: 50,
      orderBy: [{ resolvedAt: "desc" }, { createdAt: "desc" }],
      include: {
        primaryCandidate: candidateSelect,
        secondaryCandidate: candidateSelect
      }
    })
  ]);

  return {
    stats: { open, candidate, job, file, resolved },
    closed: closedItems.map((item) => ({
      id: item.id,
      reviewType: item.reviewType,
      status: item.status,
      reason: item.reason,
      confidence: item.confidence,
      createdAt: item.createdAt.toISOString(),
      resolvedAt: item.resolvedAt ? item.resolvedAt.toISOString() : null,
      primary: brief(item.primaryCandidate as CandidateRow | null),
      secondary: brief(item.secondaryCandidate as CandidateRow | null)
    })),
    items: items.map((item) => ({
      id: item.id,
      reviewType: item.reviewType,
      status: item.status,
      reason: item.reason,
      confidence: item.confidence,
      createdAt: item.createdAt.toISOString(),
      primary: brief(item.primaryCandidate as CandidateRow | null),
      secondary: brief(item.secondaryCandidate as CandidateRow | null)
    }))
  };
}
