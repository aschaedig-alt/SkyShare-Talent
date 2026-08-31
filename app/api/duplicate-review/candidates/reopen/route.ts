import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { logActivity } from "@/lib/activity/logger";

/**
 * Put a resolved or dismissed duplicate pair back in the queue.
 *
 * WHY THIS EXISTS. Both merge entry points require an OPEN review item, so once a
 * pair was resolved or dismissed there was no way back to it — even though
 * mergeCandidates itself would happily accept the pair. Reported by Hannah on
 * 2026-08-31: the scan card said 3 possible pairs while the queue showed nobody
 * and offered no merge, because all 44 items were RESOLVED or DISMISSED. That was
 * a missing UI path, not a limit of the merge engine.
 *
 * Reopening only moves the review item's status. It touches no candidate, merges
 * nothing and un-merges nothing — a pair that was genuinely merged stays merged;
 * this just makes the pair reachable again so a person can look at it.
 */
export async function POST(request: Request) {
  const authResult = await requireApiPermission("duplicates:write");
  if (!authResult.ok) {
    return (authResult as { ok: false; response: Response }).response;
  }

  try {
    const body = (await request.json()) as { itemId?: string };
    if (!body.itemId) {
      return NextResponse.json({ message: "itemId is required." }, { status: 400 });
    }

    const item = await prisma.duplicateReviewItem.findUnique({
      where: { id: body.itemId },
      select: { id: true, status: true, primaryCandidateId: true, secondaryCandidateId: true }
    });
    if (!item) {
      return NextResponse.json({ message: "Review item not found." }, { status: 404 });
    }
    if (item.status === "OPEN") {
      // Not an error: the queue may have been reopened in another tab. Say so
      // rather than pretending work was done.
      return NextResponse.json({ success: true, alreadyOpen: true, status: "OPEN" });
    }

    await prisma.duplicateReviewItem.update({
      where: { id: item.id },
      data: { status: "OPEN", resolvedAt: null }
    });

    await logActivity({
      userId: authResult.user.id ?? undefined,
      userEmail: authResult.user.email ?? undefined,
      activityType: "DUPLICATE_REOPENED",
      description: `Reopened a ${item.status.toLowerCase()} duplicate pair for review`,
      entityType: "Candidate",
      entityId: item.primaryCandidateId ?? item.secondaryCandidateId ?? item.id
    });

    return NextResponse.json({ success: true, alreadyOpen: false, status: "OPEN", from: item.status });
  } catch (error) {
    console.error("Reopen duplicate error:", error);
    return NextResponse.json({ message: "Unable to reopen this pair." }, { status: 500 });
  }
}
