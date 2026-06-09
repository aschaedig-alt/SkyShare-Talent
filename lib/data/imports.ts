import { prisma } from "@/lib/prisma";

export type ImportBatchView = {
  id: string;
  sourceType: string;
  sourceFilename: string | null;
  status: string;
  rowCount: number;
  importedCount: number;
  skippedCount: number;
  warningCount: number;
  errorCount: number;
  createdAt: string;
  completedAt: string | null;
};

export type ImportRowView = {
  id: string;
  rowNumber: number | null;
  status: string;
  candidateName: string | null;
  jobTitle: string | null;
  createdAt: string;
};

export type ImportsData = {
  batches: ImportBatchView[];
  recentRows: ImportRowView[];
  stats: {
    batches: number;
    importedRows: number;
    warnings: number;
    errors: number;
    pendingRows: number;
  };
};

export async function getImportsData(): Promise<ImportsData> {
  const [batches, recentRows, pendingRows] = await Promise.all([
    prisma.importBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.importRow.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        candidate: {
          select: {
            displayName: true
          }
        },
        job: {
          select: {
            title: true
          }
        }
      }
    }),
    prisma.importRow.count({ where: { status: "PENDING" } })
  ]);

  return {
    batches: batches.map((batch) => ({
      id: batch.id,
      sourceType: batch.sourceType,
      sourceFilename: batch.sourceFilename,
      status: batch.status,
      rowCount: batch.rowCount,
      importedCount: batch.importedCount,
      skippedCount: batch.skippedCount,
      warningCount: batch.warningCount,
      errorCount: batch.errorCount,
      createdAt: batch.createdAt.toISOString(),
      completedAt: batch.completedAt?.toISOString() ?? null
    })),
    recentRows: recentRows.map((row) => ({
      id: row.id,
      rowNumber: row.rowNumber,
      status: row.status,
      candidateName: row.candidate?.displayName ?? null,
      jobTitle: row.job?.title ?? null,
      createdAt: row.createdAt.toISOString()
    })),
    stats: {
      batches: batches.length,
      importedRows: batches.reduce((sum, batch) => sum + batch.importedCount, 0),
      warnings: batches.reduce((sum, batch) => sum + batch.warningCount, 0),
      errors: batches.reduce((sum, batch) => sum + batch.errorCount, 0),
      pendingRows
    }
  };
}
