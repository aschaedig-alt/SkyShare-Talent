import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { logActivity } from "@/lib/activity/logger";

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

    const result = await prisma.jobDuplicateDismissal.deleteMany({
      where: { OR: or },
    });

    return NextResponse.json({ restored: result.count });
  } catch (err) {
    console.error("Error restoring job duplicates:", err);
    return NextResponse.json({ error: "Failed to restore duplicates" }, { status: 500 });
  }
}
