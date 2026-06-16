import { prisma } from "@/lib/prisma";
import { getDocumentCurrency, type DocumentCurrency } from "@/lib/data/document-currency";

export type ReportsData = {
  pipeline: Array<{ label: string; value: number }>;
  sourceQuality: Array<{ label: string; value: number }>;
  jobCoverage: Array<{ label: string; value: number }>;
  documentGaps: {
    candidatesWithoutFiles: number;
    candidatesWithFiles: number;
  };
  readiness: {
    approvedRequirements: number;
    draftRequirements: number;
    activeRequirements: number;
  };
  documentCurrency: DocumentCurrency;
};

export async function getReportsData(): Promise<ReportsData> {
  const [pipeline, sourceGroups, jobs, candidatesWithoutFiles, candidatesWithFiles, approvedRequirements, draftRequirements, activeRequirements, documentCurrency] =
    await Promise.all([
      prisma.candidate.groupBy({ by: ["stage"], _count: { stage: true } }),
      prisma.candidate.groupBy({ by: ["source"], _count: { source: true } }),
      prisma.job.findMany({
        select: {
          title: true,
          _count: {
            select: {
              applications: true
            }
          }
        },
        orderBy: { title: "asc" }
      }),
      prisma.candidate.count({ where: { files: { none: {} } } }),
      prisma.candidate.count({ where: { files: { some: {} } } }),
      prisma.pilotRequirement.count({ where: { reviewStatus: "APPROVED" } }),
      prisma.pilotRequirement.count({ where: { reviewStatus: "DRAFT" } }),
      prisma.pilotRequirement.count({ where: { status: "ACTIVE" } }),
      getDocumentCurrency()
    ]);

  return {
    pipeline: pipeline.map((group) => ({ label: group.stage ?? "No stage", value: group._count.stage })),
    sourceQuality: sourceGroups.map((group) => ({ label: group.source ?? "Unknown source", value: group._count.source })),
    jobCoverage: jobs.map((job) => ({ label: job.title, value: job._count.applications })),
    documentGaps: {
      candidatesWithoutFiles,
      candidatesWithFiles
    },
    readiness: {
      approvedRequirements,
      draftRequirements,
      activeRequirements
    },
    documentCurrency
  };
}
