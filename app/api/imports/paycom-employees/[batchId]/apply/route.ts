import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { logActivity } from "@/lib/activity/logger";
import { applyChanges, nextBaseline, type ApplyOutcome } from "@/lib/paycom/employee-import";
import { loadEmployeeBatch } from "@/lib/paycom/employee-batch";

export const maxDuration = 300;

type RouteContext = { params: Promise<{ batchId: string }> };

/**
 * Apply the ticked people, once per upload. With nobody ticked it still completes the
 * batch, which records this export's positions as the baseline for the next one.
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiPermission("imports:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { batchId } = await context.params;
  const loaded = await loadEmployeeBatch(batchId);
  if (!loaded) return NextResponse.json({ message: "No such Paycom upload." }, { status: 404 });
  if (loaded.batch.status !== "PREVIEWED") {
    return NextResponse.json({ message: `This upload is already ${loaded.batch.status.toLowerCase()}. Upload the file again to see what is left.` }, { status: 409 });
  }
  // Claim the batch first, so a double click cannot apply it twice.
  const claimed = await prisma.importBatch.updateMany({ where: { id: batchId, status: "PREVIEWED" }, data: { status: "APPLYING" } });
  if (!claimed.count) return NextResponse.json({ message: "This upload is already being applied." }, { status: 409 });

  const body = (await request.json()) as { newHireIds?: string[]; titles?: Record<string, string> };
  const s = loaded.summary;
  const known = new Set(s.preview.changes.map((c) => c.newHireId));
  const newHireIds = (body.newHireIds ?? []).filter((id) => typeof id === "string" && known.has(id));
  const titles: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.titles ?? {})) if (known.has(k) && typeof v === "string") titles[k] = v.trim().slice(0, 200);

  let outcomes: ApplyOutcome[];
  try {
    outcomes = await applyChanges({
      batchId, rows: s.rows, file: s.file, asOf: s.asOf, preview: s.preview, baseline: s.previousPositions, newHireIds, titles
    });
  } catch (error) {
    // Each person is its own transaction, so whoever finished is recorded and can be undone.
    console.error("Paycom employee apply failed:", error);
    await prisma.importBatch.update({ where: { id: batchId }, data: { status: "FAILED", completedAt: new Date() } });
    return NextResponse.json({ message: "The apply stopped part-way. What finished can be undone from Recent uploads." }, { status: 500 });
  }
  const tally = (result: string) => outcomes.filter((o) => o.result === result).length;
  const applied = new Set(outcomes.filter((o) => o.result === "applied").map((o) => o.newHireId));
  await prisma.importBatch.update({
    where: { id: batchId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      importedCount: tally("applied"),
      skippedCount: tally("skipped"),
      errorCount: tally("error"),
      summaryJson: JSON.stringify({ ...s, outcomes, baselinePositions: nextBaseline(s.positions, s.previousPositions, s.preview, applied) })
    }
  });
  await logActivity({
    userId: auth.user.id,
    userEmail: auth.user.email,
    activityType: "IMPORT_COMPLETED",
    description: `Paycom employee upload (${s.file}): ${tally("applied")} applied, ${tally("skipped")} skipped, ${tally("error")} errors`,
    entityType: "ImportBatch",
    entityId: batchId
  });
  return NextResponse.json({ ok: true, outcomes });
}
