import { PaycomEmployeeImport, type PaycomEmployeeBatch } from "@/components/imports/PaycomEmployeeImport";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { prisma } from "@/lib/prisma";
import { SOURCE_TYPE } from "@/lib/paycom/employee-import";
import type { EmployeeBatchSummary } from "@/lib/paycom/employee-batch";

export const dynamic = "force-dynamic";

export default async function PaycomEmployeesImportPage() {
  await requireModulePageAccess("imports");
  const rows = await prisma.importBatch.findMany({
    where: { sourceType: SOURCE_TYPE, status: { not: "PREVIEWED" } },
    orderBy: { createdAt: "desc" },
    take: 15
  });
  const batches: PaycomEmployeeBatch[] = rows.map((b) => {
    let s: Partial<EmployeeBatchSummary> = {};
    try {
      s = JSON.parse(b.summaryJson ?? "{}") as EmployeeBatchSummary;
    } catch {
      s = {};
    }
    return {
      id: b.id,
      status: b.status,
      file: b.sourceFilename ?? "Paycom export",
      asOf: s.asOf ?? null,
      createdAt: b.createdAt.toISOString(),
      completedAt: b.completedAt?.toISOString() ?? null,
      rowCount: b.rowCount,
      appliedCount: b.importedCount,
      skippedCount: b.skippedCount,
      errorCount: b.errorCount,
      uploadedBy: s.uploadedBy ?? null,
      applied: (s.outcomes ?? []).flatMap((o) => (o.result === "applied" ? [`${o.name}: ${o.did.join("; ")}`] : []))
    };
  });
  return <PaycomEmployeeImport batches={batches} />;
}
