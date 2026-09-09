import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { logActivity } from "@/lib/activity/logger";
import { listDismissedPairs } from "@/lib/jobs/duplicate-detection";

/**
 * Read back every "not duplicates" decision. Added 2026-09-09 with the screen that
 * shows them: they had been write-only, which meant a decision nobody could see or
 * reverse. Read-only, so it takes jobs:read rather than jobs:write.
 */
export async function GET() {
  const authResult = await requireApiPermission("jobs:read");
  if (!authResult.ok) {
    return (authResult as { ok: false; response: Response }).response;
  }
  try {
    return NextResponse.json({ pairs: await listDismissedPairs() });
  } catch (err) {
    console.error("Error listing dismissed job pairs:", err);
    return NextResponse.json({ error: "Failed to list dismissed pairs" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authResult = await requireApiPermission("jobs:write");
  if (!authResult.ok) {
    return (authResult as { ok: false; response: Response }).response;
  }

  try {
    const body = (await request.json()) as { pairs?: [string, string][] };
    const pairs = body.pairs ?? [];

    if (!Array.isArray(pairs) || pairs.length === 0) {
      return NextResponse.json({ error: "No pairs provided" }, { status: 400 });
    }

    // Normalize each pair so jobIdA < jobIdB, drop self-pairs and dupes.
    const seen = new Set<string>();
    const rows: { jobIdA: string; jobIdB: string; createdBy?: string }[] = [];
    for (const [a, b] of pairs) {
      if (!a || !b || a === b) continue;
      const jobIdA = a < b ? a : b;
      const jobIdB = a < b ? b : a;
      const key = `${jobIdA}|${jobIdB}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ jobIdA, jobIdB, createdBy: authResult.user.email ?? undefined });
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "No valid pairs" }, { status: 400 });
    }

    const result = await prisma.jobDuplicateDismissal.createMany({
      data: rows,
      skipDuplicates: true,
    });

    await logActivity({
      userId: authResult.user.id ?? undefined,
      userEmail: authResult.user.email ?? undefined,
      activityType: "JOB_EDITED",
      description: `Marked ${rows.length} job pair${rows.length === 1 ? "" : "s"} as not duplicates`,
      entityType: "Job",
      metadata: { dismissedPairs: rows.length },
    });

    return NextResponse.json({ dismissed: result.count, requested: rows.length });
  } catch (err) {
    console.error("Error dismissing job duplicates:", err);
    return NextResponse.json({ error: "Failed to dismiss duplicates" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const authResult = await requireApiPermission("jobs:write");
  if (!authResult.ok) {
    return (authResult as { ok: false; response: Response }).response;
  }

  try {
    const body = (await request.json()) as { pairs?: [string, string][] };
    const pairs = body.pairs ?? [];

    if (!Array.isArray(pairs) || pairs.length === 0) {
      return NextResponse.json({ error: "No pairs provided" }, { status: 400 });
    }

    const or = pairs
      .filter(([a, b]) => a && b && a !== b)
      .map(([a, b]) => ({
        jobIdA: a < b ? a : b,
        jobIdB: a < b ? b : a,
      }));

    if (or.length === 0) {
      return NextResponse.json({ error: "No valid pairs" }, { status: 400 });
    }

    const result = await prisma.jobDuplicateDismissal.deleteMany({
      where: { OR: or },
    });

    // Restoring is as much a decision as dismissing, and the POST side has always
    // been logged. Without this, a pair reappearing in the scan has no explanation.
    if (result.count > 0) {
      await logActivity({
        userId: authResult.user.id ?? undefined,
        userEmail: authResult.user.email ?? undefined,
        activityType: "JOB_EDITED",
        description: `Restored ${result.count} job pair${result.count === 1 ? "" : "s"} to duplicate review`,
        entityType: "Job",
        metadata: { restoredPairs: result.count },
      });
    }

    return NextResponse.json({ restored: result.count, requested: or.length });
  } catch (err) {
    console.error("Error restoring job duplicates:", err);
    return NextResponse.json({ error: "Failed to restore duplicates" }, { status: 500 });
  }
}
