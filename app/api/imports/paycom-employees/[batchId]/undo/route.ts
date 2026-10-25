import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { logActivity } from "@/lib/activity/logger";
import { undoBatch } from "@/lib/paycom/employee-import";
import { loadEmployeeBatch } from "@/lib/paycom/employee-batch";

export const maxDuration = 300;

type RouteContext = { params: Promise<{ batchId: string }> };

/** Reverse a Paycom employee upload. It also stops being the position baseline. */
export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireApiPermission("imports:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { batchId } = await context.params;
  const loaded = await loadEmployeeBatch(batchId);
  if (!loaded) return NextResponse.json({ message: "No such Paycom upload." }, { status: 404 });
  if (!["COMPLETED", "PARTLY UNDONE", "FAILED"].includes(loaded.batch.status)) {
    return NextResponse.json({ message: `Only an applied upload can be undone (this one is ${loaded.batch.status.toLowerCase()}).` }, { status: 409 });
  }

  const report = await undoBatch(batchId);
  await prisma.importBatch.update({
    where: { id: batchId },
    data: {
      status: report.errors.length ? "PARTLY UNDONE" : "UNDONE",
      importedCount: { decrement: report.undone },
      summaryJson: JSON.stringify({ ...loaded.summary, undo: { at: new Date().toISOString(), by: auth.user.email ?? null, ...report } })
    }
  });
  await logActivity({
    userId: auth.user.id,
    userEmail: auth.user.email,
    activityType: "IMPORT_COMPLETED",
    description: `Paycom employee upload undone: ${report.undone} reversed, ${report.errors.length} could not be`,
    entityType: "ImportBatch",
    entityId: batchId
  });
  return NextResponse.json({ ok: true, report });
}
