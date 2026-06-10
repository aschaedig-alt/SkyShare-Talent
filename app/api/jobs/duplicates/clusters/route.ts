import { NextResponse } from "next/server";
import { findAllDuplicateClusters } from "@/lib/jobs/duplicate-detection";
import { requireApiPermission } from "@/lib/auth/route-auth";

export async function GET(request: Request) {
  const authResult = await requireApiPermission("jobs:read");
  if (!authResult.ok) {
    return (authResult as { ok: false; response: Response }).response;
  }

  const { searchParams } = new URL(request.url);
  const thresholdParam = searchParams.get("threshold");
  const threshold = thresholdParam ? Number(thresholdParam) : 60;

  try {
    const clusters = await findAllDuplicateClusters(
      Number.isFinite(threshold) ? threshold : 60
    );
    return NextResponse.json({ clusters });
  } catch (err) {
    console.error("Error scanning job duplicate clusters:", err);
    return NextResponse.json(
      { error: "Failed to scan job duplicates" },
      { status: 500 }
    );
  }
}
