import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission, authFailureResponse } from "@/lib/auth/route-auth";
import { isCandidateVisible } from "@/lib/auth/candidate-scope";
import { logActivity } from "@/lib/activity/logger";
import { combineIntoImported, isCombineRefusal } from "@/lib/candidates/combine-applications";

/**
 * PUT /api/candidate-applications/[id]/job — link THIS application to a job, in
 * place. Body: { candidateId, jobId, combine? }. jobId null unlinks an imported
 * application again.
 *
 * Her words, feedback cmtynseh3 (Sep 12): "i'm seeing a lot of these 'unlinked
 * job' but i cant see how to link the actual job in its place. i tried it and it
 * just linked a second job." Link to a job (POST /api/candidate-applications)
 * makes a NEW application — right for "they are now being considered for this",
 * wrong for "this application from Paycom was for that job". This is the second.
 *
 * THE SECOND-ROW CASE. Twenty-seven people already had an imported application
 * AND a row made by Link to a job for what is really the same application —
 * usually the row holding the offer, because an offer needs a job. Linking the
 * imported one to that same job would leave two rows for one application. So
 * when the candidate already has a hand-made row for the job, the first call
 * answers 409 and describes it, and the UI asks; with combine: true the two
 * become ONE row — the imported one, which keeps Paycom's application id, date
 * and wording (the stage reconciliation matches on that id), taking over the
 * offer, requirement link, note, questionnaire answers and any status somebody
 * set by hand. Refused when BOTH rows carry an offer: which one is real is a
 * judgement, not a merge rule.
 *
 * Only an unlinked row can be linked, and only an IMPORTED row can be unlinked:
 * re-pointing a linked row is "that was the wrong job" and has its own undo (the
 * remove control), and a hand-made row with no job would be an empty row.
 */

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return authFailureResponse(auth);

  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { candidateId?: unknown; jobId?: unknown; combine?: unknown };
  const candidateId = typeof body.candidateId === "string" ? body.candidateId : "";
  if (!candidateId) return NextResponse.json({ message: "candidateId is required." }, { status: 400 });
  if (!isCandidateVisible(auth.user.viewer, candidateId)) {
    return NextResponse.json({ message: "Candidate not found." }, { status: 404 });
  }

  const application = await prisma.candidateApplication.findUnique({
    where: { id },
    include: { candidate: { select: { displayName: true } }, job: { select: { title: true } } }
  });
  if (!application || application.candidateId !== candidateId) {
    return NextResponse.json({ message: "Application not found." }, { status: 404 });
  }
  const label = application.historicalJobTitle ?? application.job?.title ?? "application";
  const actor = { userId: auth.user.id ?? undefined, userEmail: auth.user.email ?? undefined };

  // ---- Unlink -------------------------------------------------------------
  if (body.jobId === null) {
    if (!application.sourceApplicationId) {
      return NextResponse.json({ message: "Only an application imported from Paycom can be unlinked." }, { status: 400 });
    }
    if (!application.jobId) return NextResponse.json({ ok: true, unchanged: true });
    await prisma.candidateApplication.update({ where: { id }, data: { jobId: null } });
    await logActivity({
      ...actor,
      activityType: "CANDIDATE_EDITED",
      description: `Unlinked ${application.candidate.displayName}'s Paycom application "${label}" from the job "${application.job?.title ?? "?"}"`,
      entityType: "Candidate",
      entityId: candidateId,
      metadata: { applicationId: id, previousJobId: application.jobId }
    });
    return NextResponse.json({ ok: true, jobId: null });
  }

  // ---- Link ---------------------------------------------------------------
  if (typeof body.jobId !== "string" || !body.jobId) {
    return NextResponse.json({ message: "jobId is required." }, { status: 400 });
  }
  if (application.jobId) {
    return NextResponse.json({ message: "This application is already linked to a job." }, { status: 409 });
  }

  // A merged job's name belongs to the job it was merged into, so link there.
  let job = await prisma.job.findUnique({ where: { id: body.jobId }, select: { id: true, title: true, mergedIntoJobId: true } });
  for (let hops = 0; job?.mergedIntoJobId && hops < 5; hops += 1) {
    job = await prisma.job.findUnique({ where: { id: job.mergedIntoJobId }, select: { id: true, title: true, mergedIntoJobId: true } });
  }
  if (!job) return NextResponse.json({ message: "Job not found." }, { status: 404 });

  const handMade = await prisma.candidateApplication.findFirst({
    where: { candidateId, jobId: job.id, id: { not: id }, sourceApplicationId: null, origin: { not: "JAZZ" } },
    orderBy: { createdAt: "asc" }
  });

  if (handMade && body.combine !== true) {
    return NextResponse.json(
      {
        message: `${application.candidate.displayName} already has a row for ${job.title}.`,
        needsCombine: true,
        other: { id: handMade.id, source: handMade.source, status: handMade.status, offerStatus: handMade.offerStatus },
        jobTitle: job.title
      },
      { status: 409 }
    );
  }

  if (!handMade) {
    await prisma.candidateApplication.update({ where: { id }, data: { jobId: job.id } });
    await logActivity({
      ...actor,
      activityType: "CANDIDATE_EDITED",
      description: `Linked ${application.candidate.displayName}'s Paycom application "${label}" to the job "${job.title}"`,
      entityType: "Candidate",
      entityId: candidateId,
      metadata: { applicationId: id, jobId: job.id }
    });
    return NextResponse.json({ ok: true, jobId: job.id, jobTitle: job.title });
  }

  // ---- Combine ------------------------------------------------------------
  // The rules for what survives live in ONE place, shared with the bulk run that
  // cleared the backlog — see lib/candidates/combine-applications.ts.
  const outcome = await combineIntoImported(id, handMade.id, job.id);
  if (isCombineRefusal(outcome)) {
    return NextResponse.json({ message: outcome.message }, { status: 409 });
  }

  // Everything the removed row held is in here, so a combine can be reconstructed
  // by hand if it ever needs to be. Deliberately NOT the offer-details text: this
  // log is read outside HR.
  await logActivity({
    ...actor,
    activityType: "CANDIDATE_EDITED",
    description:
      `Combined ${application.candidate.displayName}'s Paycom application "${label}" with the ${job.title} row ` +
      `made in the app${outcome.tookOffer ? ", keeping its offer" : ""}`,
    entityType: "Candidate",
    entityId: candidateId,
    metadata: {
      applicationId: id,
      jobId: job.id,
      removedApplicationId: outcome.removed.id,
      removedSource: outcome.removed.source,
      removedStatus: outcome.removed.status,
      removedStage: outcome.removed.stage,
      removedAppliedAt: outcome.removed.appliedAt?.toISOString() ?? null,
      removedOfferStatus: outcome.removed.offerStatus,
      removedOfferStepsJson: outcome.removed.offerStepsJson
    }
  });

  return NextResponse.json({ ok: true, jobId: job.id, jobTitle: job.title, combined: true });
}
