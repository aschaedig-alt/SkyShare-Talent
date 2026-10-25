import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { logActivity } from "@/lib/activity/logger";
import { applyApplications, type ApplyChoices } from "@/lib/paycom/applicant-import";
import { loadBatch, readBatchUploads } from "@/lib/paycom/applicant-batch";

export const maxDuration = 300;

// The page sends 10 at a time; this is only the ceiling.
const MAX_PER_REQUEST = 25;

type RouteContext = { params: Promise<{ batchId: string }> };

/** Import the applications listed, in order. The page calls this chunk by chunk. */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiPermission("imports:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { batchId } = await context.params;
  const loaded = await loadBatch(batchId);
  if (!loaded) return NextResponse.json({ message: "No such Paycom upload." }, { status: 404 });
  if (!loaded.summary.applications) return NextResponse.json({ message: "Preview this upload first." }, { status: 409 });
  if (loaded.batch.status.includes("UNDONE")) return NextResponse.json({ message: "This upload was undone." }, { status: 409 });

  const body = (await request.json()) as { applicationIds?: string[]; choices?: Partial<ApplyChoices>; last?: boolean };
  const applicationIds = (body.applicationIds ?? []).filter((id) => typeof id === "string" && /^\d{4,8}$/.test(id));
  if (applicationIds.length > MAX_PER_REQUEST) {
    return NextResponse.json({ message: `Send at most ${MAX_PER_REQUEST} applications per request.` }, { status: 400 });
  }
  const choices: ApplyChoices = {
    candidates: body.choices?.candidates ?? {},
    jobs: body.choices?.jobs ?? {},
    keepClosed: body.choices?.keepClosed ?? []
  };

  if (loaded.batch.status === "PREVIEWED") {
    await prisma.importBatch.update({ where: { id: batchId }, data: { status: "APPLYING" } });
    await logActivity({
      userId: auth.user.id,
      userEmail: auth.user.email,
      activityType: "IMPORT_STARTED",
      description: `Paycom applicant upload started (${loaded.batch.sourceFilename ?? batchId})`,
      entityType: "ImportBatch",
      entityId: batchId
    });
  }

  const read = await readBatchUploads(loaded.summary, { parsed: true });
  const outcomes = await applyApplications({ batchId, read, applicationIds, choices, userEmail: auth.user.email ?? null });

  const tally = (result: string) => outcomes.filter((o) => o.result === result).length;
  const batch = await prisma.importBatch.update({
    where: { id: batchId },
    data: {
      importedCount: { increment: tally("imported") },
      skippedCount: { increment: tally("skipped") },
      errorCount: { increment: tally("error") },
      ...(body.last ? { status: "COMPLETED", completedAt: new Date() } : {})
    },
    select: { importedCount: true, skippedCount: true, errorCount: true }
  });
  if (body.last) {
    await logActivity({
      userId: auth.user.id,
      userEmail: auth.user.email,
      activityType: "IMPORT_COMPLETED",
      description: `Paycom applicant upload: ${batch.importedCount} imported, ${batch.skippedCount} skipped, ${batch.errorCount} errors`,
      entityType: "ImportBatch",
      entityId: batchId
    });
  }
  return NextResponse.json({ ok: true, outcomes });
}
