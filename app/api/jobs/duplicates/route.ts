import { NextResponse } from "next/server";
import { findDuplicateJobs, compareJobs } from "@/lib/jobs/duplicate-detection";
import { requireApiPermission } from "@/lib/auth/route-auth";

export async function GET(request: Request) {
  const authResult = await requireApiPermission("jobs:read");
  if (!authResult.ok) {
    return (authResult as { ok: false; response: Response }).response;
  }

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  const compareWith = searchParams.get("compareWith");

  if (!jobId) {
    return NextResponse.json(
      { error: "jobId query parameter is required" },
      { status: 400 }
    );
  }

  try {
    if (compareWith) {
      // Get detailed comparison of two jobs
      const comparison = await compareJobs(jobId, compareWith);
      if (!comparison) {
        return NextResponse.json(
          { error: "One or both jobs not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(comparison);
    } else {
      // Find duplicates for a job
      const duplicates = await findDuplicateJobs(jobId);
      return NextResponse.json(duplicates);
    }
  } catch (err) {
    console.error("Error finding duplicates:", err);
    return NextResponse.json(
      { error: "Failed to find duplicate jobs" },
      { status: 500 }
    );
  }
}
