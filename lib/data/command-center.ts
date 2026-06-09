import { prisma } from "@/lib/prisma";

export type CommandCenterData = {
  stats: {
    candidates: number;
    files: number;
    jobs: number;
    pilotRequirements: number;
    openImports: number;
    scheduledInterviews: number;
  };
  readiness: Array<{ label: string; value: number }>;
  recentCandidates: Array<{
    id: string;
    displayName: string;
    currentTitle: string | null;
    stage: string | null;
  }>;
  recentJobs: Array<{
    id: string;
    title: string;
    status: string;
    isPilotRole: boolean;
  }>;
  attentionItems: Array<{
    label: string;
    value: number;
    detail: string;
    href: string;
  }>;
};

export async function getCommandCenterData(): Promise<CommandCenterData> {
  const [
    candidates,
    files,
    jobs,
    pilotRequirements,
    openImports,
    scheduledInterviews,
    recentCandidates,
    recentJobs,
    needsReviewRequirements,
    importWarnings,
    candidateDuplicates
  ] = await Promise.all([
    prisma.candidate.count(),
    prisma.candidateFile.count(),
    prisma.job.count(),
    prisma.pilotRequirement.count(),
    prisma.importRow.count({ where: { status: "PENDING" } }),
    prisma.interview.count({ where: { status: "SCHEDULED" } }),
    prisma.candidate.findMany({
      take: 5,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        displayName: true,
        currentTitle: true,
        stage: true
      }
    }),
    prisma.job.findMany({
      take: 5,
      orderBy: [{ isPilotRole: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        title: true,
        status: true,
        isPilotRole: true
      }
    }),
    prisma.pilotRequirement.count({ where: { reviewStatus: { not: "APPROVED" } } }),
    prisma.importBatch.count({ where: { OR: [{ warningCount: { gt: 0 } }, { errorCount: { gt: 0 } }] } }),
    prisma.duplicateReviewItem.count({ where: { status: "OPEN", reviewType: "CANDIDATE" } })
  ]);

  const stageGroups = await prisma.candidate.groupBy({
    by: ["stage"],
    _count: { stage: true }
  });

  return {
    stats: {
      candidates,
      files,
      jobs,
      pilotRequirements,
      openImports,
      scheduledInterviews
    },
    readiness: stageGroups.map((group) => ({
      label: group.stage ?? "No stage",
      value: group._count.stage
    })),
    recentCandidates,
    recentJobs,
    attentionItems: [
      {
        label: "Requirements need review",
        value: needsReviewRequirements,
        detail: "Profiles not yet approved",
        href: "/pilot-requirements"
      },
      {
        label: "Import warnings",
        value: importWarnings,
        detail: "Batches with warnings or errors",
        href: "/imports"
      },
      {
        label: "Candidate duplicate reviews",
        value: candidateDuplicates,
        detail: "Open duplicate review items",
        href: "/duplicate-review"
      }
    ]
  };
}
