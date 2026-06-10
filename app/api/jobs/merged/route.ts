import { NextResponse } from "next/server";
import { listMergedJobs } from "@/lib/jobs/merge";
import { requireApiPermission } from "@/lib/auth/route-auth";

export async function GET() {
  const authResult = await requireApiPermission("jobs:read");
  if (!authResult.ok) {
    return (authResult as { ok: false; response: Response }).response;
  }

  try {
    const merged = await listMergedJobs();
    return NextResponse.json({ merged });
  } catch (err) {
    console.error("Error listing merged jobs:", err);
    return NextResponse.json({ error: "Failed to list merged jobs" }, { status: 500 });
  }
}
