import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { logActivity } from "@/lib/activity/logger";
import { undoBatch } from "@/lib/paycom/applicant-import";
import { loadBatch, saveSummary } from "@/lib/paycom/applicant-batch";

export const maxDuration = 300;

type RouteContext = { params: Promise<{ batchId: string }> };

/** Reverse a Paycom applicant upload. Work done since (a status change, an interview) is kept. */
export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireApiPermission("imports:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { batchId } = await context.params;
  const loaded = await loadBatch(batchId);
  if (!loaded) return NextResponse.json({ message: "No such Paycom upload." }, { status: 404 });
  if (loaded.batch.status === "UNDONE") return NextResponse.json({ message: "Already undone." }, { status: 409 });

  const report = await undoBatch(batchId);
  await saveSummary(
    batchId,
    { ...loaded.summary, undo: { at: new Date().toISOString(), by: auth.user.email ?? null, ...report } },
    {
      status: report.keptBecauseWorked.length ? "PARTLY UNDONE" : "UNDONE",
      importedCount: { decrement: report.undone }
    }
  );
  await logActivity({
    userId: auth.user.id,
    userEmail: auth.user.email,
    activityType: "IMPORT_COMPLETED",
    description: `Paycom applicant upload undone: ${report.undone} reversed, ${report.keptBecauseWorked.length} kept because they had been worked`,
    entityType: "ImportBatch",
    entityId: batchId
  });
  return NextResponse.json({ ok: true, report });
}
