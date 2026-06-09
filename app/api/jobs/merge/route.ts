import { NextResponse } from "next/server";
import { mergeJobs, undoMerge } from "@/lib/jobs/merge";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { logActivity } from "@/lib/activity/logger";

export async function POST(request: Request) {
  const authResult = await requireApiPermission("jobs:write");
  if (!authResult.ok) {
    return (authResult as { ok: false; response: Response }).response;
  }

  try {
    const body = (await request.json()) as {
      primaryJobId: string;
      secondaryJobId: string;
      undo?: boolean;
    };

    const { primaryJobId, secondaryJobId, undo } = body;

    if (!primaryJobId || !secondaryJobId) {
      return NextResponse.json(
        { error: "primaryJobId and secondaryJobId are required" },
        { status: 400 }
      );
    }

    let result;
    if (undo) {
      result = await undoMerge(secondaryJobId);
    } else {
      result = await mergeJobs(primaryJobId, secondaryJobId);
    }

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    // Log the activity
    await logActivity({
      userId: authResult.user.id ?? undefined,
      userEmail: authResult.user.email ?? undefined,
      activityType: undo ? "JOB_EDITED" : "JOB_EDITED",
      description: undo
        ? `Undid merge for job ${secondaryJobId}`
        : `Merged job ${secondaryJobId} into ${primaryJobId} (${result.affectedRecords.applications} applications, ${result.affectedRecords.interviews} interviews)`,
      entityType: "Job",
      entityId: primaryJobId,
      metadata: {
        primaryJobId,
        secondaryJobId,
        ...result.affectedRecords,
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("Error in merge operation:", err);
    return NextResponse.json(
      { error: "Failed to merge jobs", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
