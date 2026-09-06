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

/**
 * Edit the disposition reason on one application.
 *
 * This is the text under the outcome on the candidates list — "Did Not Meet
 * Minimum Requirements", "Incomplete application". It is stored raw in
 * CandidateApplication.status, exactly as Paycom words it, and grouped for
 * display by dispositionGroup() rather than being rewritten on import. Editing
 * it therefore changes what the row says AND which reason group it falls into,
 * which is the point: the groups are only as good as the text under them.
 *
 * The coarse `disposition` code is deliberately NOT touched. It is what the
 * bucket ladder reads for hired/offered, and letting a free-text edit move
 * somebody between segments would be a surprising side effect of fixing a typo.
 *
 * Same ownership guard as DELETE below: a row id alone is not enough to act on
 * it, the candidateId has to match.
 */
export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    candidateId?: unknown;
    statusText?: unknown;
  };
  const candidateId = typeof body.candidateId === "string" ? body.candidateId : "";
  if (!candidateId) {
    return NextResponse.json({ message: "candidateId is required." }, { status: 400 });
  }
  if (typeof body.statusText !== "string") {
    return NextResponse.json({ message: "statusText is required." }, { status: 400 });
  }
  // Trimmed, and an empty string clears it rather than storing "". A cleared
  // reason reads as "no reason recorded", which is a real state.
  const statusText = body.statusText.trim();
  if (statusText.length > 200) {
    return NextResponse.json(
      { message: "That reason is too long — keep it under 200 characters." },
      { status: 400 }
    );
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

  const previous = application.status ?? "";
  if (previous === statusText) return NextResponse.json({ ok: true, unchanged: true });

  await prisma.candidateApplication.update({
    where: { id },
    data: { status: statusText || null }
  });

  await logActivity({
    userId: auth.user?.id,
    userEmail: auth.user?.email || undefined,
    activityType: "CANDIDATE_EDITED",
    // The OLD value goes in the description on purpose — this overwrites a
    // field imported from Paycom, and without it there is no way back to what
    // Paycom actually said.
    description:
      `Changed the reason on ${application.candidate.displayName}'s ` +
      `${application.job?.title ?? "application"} from "${previous || "(none)"}" to "${statusText || "(none)"}"`,
    entityType: "Candidate",
    entityId: candidateId
  });

  return NextResponse.json({ ok: true, statusText });
}

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
