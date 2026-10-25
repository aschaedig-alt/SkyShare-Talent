import { prisma } from "@/lib/prisma";
import { SOURCE_TYPE, type ApplyOutcome, type Preview } from "@/lib/paycom/employee-import";
import type { ExportRow } from "@/lib/paycom/employee-export";

/**
 * The ImportBatch behind one Paycom employee upload. The export is a few dozen KB, so
 * it is posted straight to the preview route and never stored as a file: the batch's
 * summaryJson keeps the rows read from it, the preview, and the positions the next
 * upload compares with.
 *
 * Status: PREVIEWED -> COMPLETED (applied, even with nothing ticked: it becomes the
 * position baseline) -> UNDONE, or PARTLY UNDONE when a row would not reverse.
 */
export type EmployeeBatchSummary = {
  file: string;
  asOf: string;
  rows: ExportRow[];
  preview: Preview;
  /** Every matched person's Paycom position in this export. */
  positions: Record<string, string>;
  /** The baseline this preview compared with (null on the first upload). */
  previousPositions: Record<string, string> | null;
  /** Set on apply: what the NEXT upload compares with. */
  baselinePositions?: Record<string, string>;
  uploadedBy?: string | null;
  outcomes?: ApplyOutcome[];
  undo?: { at: string; by: string | null; undone: number; errors: string[] };
};

export async function loadEmployeeBatch(batchId: string) {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch || batch.sourceType !== SOURCE_TYPE) return null;
  return { batch, summary: JSON.parse(batch.summaryJson ?? "{}") as EmployeeBatchSummary };
}
