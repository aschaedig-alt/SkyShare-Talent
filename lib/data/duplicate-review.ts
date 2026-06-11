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
  const [items, open, candidate, job, file, resolved] = await Promise.all([
    prisma.duplicateReviewItem.findMany({
      take: 50,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        primaryCandidate: candidateSelect,
        secondaryCandidate: candidateSelect
      }
    }),
    prisma.duplicateReviewItem.count({ where: { status: "OPEN" } }),
    prisma.duplicateReviewItem.count({ where: { status: "OPEN", reviewType: "CANDIDATE" } }),
    prisma.duplicateReviewItem.count({ where: { status: "OPEN", reviewType: "JOB" } }),
    prisma.duplicateReviewItem.count({ where: { status: "OPEN", reviewType: "FILE" } }),
    prisma.duplicateReviewItem.count({ where: { status: { not: "OPEN" } } })
  ]);

  return {
    stats: { open, candidate, job, file, resolved },
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
