import { NextResponse } from "next/server";
import { undoMerge } from "@/lib/jobs/merge";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { logActivity } from "@/lib/activity/logger";

export async function POST(request: Request) {
  const authResult = await requireApiPermission("jobs:write");
  if (!authResult.ok) {
    return (authResult as { ok: false; response: Response }).response;
  }

  try {
    const body = (await request.json()) as { jobId?: string };
    const jobId = body.jobId;

    if (!jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    const result = await undoMerge(jobId);
    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    await logActivity({
      userId: authResult.user.id ?? undefined,
      userEmail: authResult.user.email ?? undefined,
      activityType: "JOB_EDITED",
      description: `Unmerged job ${jobId} (${result.affectedRecords.applications} applications, ${result.affectedRecords.interviews} interviews restored)`,
      entityType: "Job",
      entityId: jobId,
      metadata: { ...result.affectedRecords },
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("Error unmerging job:", err);
    return NextResponse.json({ error: "Failed to unmerge job" }, { status: 500 });
  }
}
