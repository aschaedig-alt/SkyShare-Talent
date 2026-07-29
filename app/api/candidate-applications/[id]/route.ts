import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { logActivity } from "@/lib/activity/logger";

/**
 * Undo a job link made in error — "i mistakenly linked a wrong job to a
 * candidate. i need to be able to undo that."
 *
 * REFUSES if the application already carries real offer progress
 * (offerStatus !== "NONE"). An application is where the whole offer workflow
 * lives (offerStepsJson, signed/declined dates, ...) — deleting the row would
 * silently throw that away along with the mistaken link. A link made by
 * mistake and clicked again seconds later has none of that; a link with real
 * offer activity on it is no longer "just a wrong link" and needs a
 * deliberate decision, not a quick unlink button.
 *
 * candidateId is required and checked against the row, the same ownership
 * guard used for interview delete — a row id alone is not enough to act on it.
 */

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { candidateId?: unknown };
  const candidateId = typeof body.candidateId === "string" ? body.candidateId : "";
  if (!candidateId) {
    return NextResponse.json({ message: "candidateId is required." }, { status: 400 });
  }

  const application = await prisma.candidateApplication.findUnique({
    where: { id },
    include: {
      candidate: { select: { id: true, displayName: true } },
      job: { select: { title: true } }
    }
  });
  if (!application || application.candidateId !== candidateId) {
    return NextResponse.json({ message: "Application not found." }, { status: 404 });
  }

  if ((application.offerStatus ?? "NONE") !== "NONE") {
    return NextResponse.json(
      {
        message:
          "This link already has offer activity on it, so it can't be quietly removed. Work it from the Offers tab instead."
      },
      { status: 409 }
    );
  }

  await prisma.candidateApplication.delete({ where: { id } });

  await logActivity({
    userId: auth.user?.id,
    userEmail: auth.user?.email || undefined,
    activityType: "CANDIDATE_EDITED",
    description: `Removed the link to ${application.job?.title ?? "a job"} from ${application.candidate.displayName}`,
    entityType: "Candidate",
    entityId: candidateId
  });

  return NextResponse.json({ ok: true });
}
