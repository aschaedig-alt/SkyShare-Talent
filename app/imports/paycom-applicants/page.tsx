import { PaycomApplicantImport, type PaycomBatchSummary } from "@/components/imports/PaycomApplicantImport";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { prisma } from "@/lib/prisma";
import { SOURCE_TYPE } from "@/lib/paycom/applicant-import";
import type { BatchSummary } from "@/lib/paycom/applicant-batch";

export const dynamic = "force-dynamic";

export default async function PaycomApplicantsImportPage() {
  await requireModulePageAccess("imports");
  const rows = await prisma.importBatch.findMany({
    where: { sourceType: SOURCE_TYPE, status: { not: "UPLOADING" } },
    orderBy: { createdAt: "desc" },
    take: 15
  });
  const batches: PaycomBatchSummary[] = rows.map((b) => {
    let uploadedBy: string | null = null;
    try {
      uploadedBy = (JSON.parse(b.summaryJson ?? "{}") as BatchSummary).uploadedBy ?? null;
    } catch {
      uploadedBy = null;
    }
    return {
      id: b.id,
      status: b.status,
      files: b.sourceFilename ?? "Paycom upload",
      createdAt: b.createdAt.toISOString(),
      completedAt: b.completedAt?.toISOString() ?? null,
      rowCount: b.rowCount,
      importedCount: b.importedCount,
      skippedCount: b.skippedCount,
      errorCount: b.errorCount,
      uploadedBy
    };
  });
  return <PaycomApplicantImport batches={batches} />;
}
