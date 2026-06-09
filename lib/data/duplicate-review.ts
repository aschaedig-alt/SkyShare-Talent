import { prisma } from "@/lib/prisma";

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
    primaryCandidateName: string | null;
    secondaryCandidateName: string | null;
    createdAt: string;
  }>;
};

export async function getDuplicateReviewData(): Promise<DuplicateReviewData> {
  const [items, open, candidate, job, file, resolved] = await Promise.all([
    prisma.duplicateReviewItem.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
      include: {
        primaryCandidate: { select: { displayName: true } },
        secondaryCandidate: { select: { displayName: true } }
      }
    }),
    prisma.duplicateReviewItem.count({ where: { status: "OPEN" } }),
    prisma.duplicateReviewItem.count({ where: { status: "OPEN", reviewType: "CANDIDATE" } }),
    prisma.duplicateReviewItem.count({ where: { status: "OPEN", reviewType: "JOB" } }),
    prisma.duplicateReviewItem.count({ where: { status: "OPEN", reviewType: "FILE" } }),
    prisma.duplicateReviewItem.count({ where: { status: { not: "OPEN" } } })
  ]);

  return {
    stats: {
      open,
      candidate,
      job,
      file,
      resolved
    },
    items: items.map((item) => ({
      id: item.id,
      reviewType: item.reviewType,
      status: item.status,
      reason: item.reason,
      confidence: item.confidence,
      primaryCandidateName: item.primaryCandidate?.displayName ?? null,
      secondaryCandidateName: item.secondaryCandidate?.displayName ?? null,
      createdAt: item.createdAt.toISOString()
    }))
  };
}
