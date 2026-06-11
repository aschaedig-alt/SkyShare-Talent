import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { mergeCandidates, dismissDuplicateReview } from "@/lib/candidates/merge";
import { logActivity } from "@/lib/activity/logger";

export async function POST(request: Request) {
  const authResult = await requireApiPermission("duplicates:write");
  if (!authResult.ok) {
    return (authResult as { ok: false; response: Response }).response;
  }

  try {
    const body = (await request.json()) as {
      itemId?: string;
      action?: "merge" | "dismiss";
      keepId?: string;
      dropId?: string;
    };

    if (!body.itemId || !body.action) {
      return NextResponse.json({ message: "itemId and action are required." }, { status: 400 });
    }

    if (body.action === "dismiss") {
      const result = await dismissDuplicateReview(body.itemId);
      return NextResponse.json(result, { status: result.success ? 200 : 400 });
    }

    // merge
    if (!body.keepId || !body.dropId) {
      return NextResponse.json({ message: "keepId and dropId are required to merge." }, { status: 400 });
    }

    const result = await mergeCandidates(body.keepId, body.dropId, {
      id: authResult.user.id,
      email: authResult.user.email
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    // Mark the originating review item resolved (mergeCandidates resolves open items
    // involving the dropped candidate; ensure this one is too).
    await prisma.duplicateReviewItem.update({
      where: { id: body.itemId },
      data: { status: "RESOLVED", resolvedAt: new Date() }
    });

    await logActivity({
      userId: authResult.user.id ?? undefined,
      userEmail: authResult.user.email ?? undefined,
      activityType: "DUPLICATE_RESOLVED",
      description: `Merged duplicate candidates (kept ${body.keepId})`,
      entityType: "Candidate",
      entityId: body.keepId
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Resolve duplicate error:", error);
    return NextResponse.json({ message: "Unable to resolve duplicate." }, { status: 500 });
  }
}
