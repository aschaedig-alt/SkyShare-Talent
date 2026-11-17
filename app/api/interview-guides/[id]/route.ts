import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission, requireApiUser, authFailureResponse } from "@/lib/auth/route-auth";
import { guideUpdateSchema } from "@/lib/validation/interview-guide";
import { getInterviewGuide } from "@/lib/data/interview-guides";
import { resolveGuideWrite, resolveLink } from "@/lib/interview-guides/access.server";
import { logActivity } from "@/lib/activity/logger";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("calendar:read");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const { id } = await params;
  const guide = await getInterviewGuide(id, auth.user.viewer);
  if (!guide) return NextResponse.json({ message: "Guide not found." }, { status: 404 });
  return NextResponse.json(guide);
}

/** Rename, change who asked, or link the guide to a candidate / interview. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return authFailureResponse(auth);
  const { id } = await params;
  const access = await resolveGuideWrite(auth.user, id);
  if ("response" in access) return access.response;

  try {
    const data = guideUpdateSchema.parse(await request.json());
    const update: { title?: string; interviewer?: string | null; candidateId?: string | null; interviewId?: string | null } = {};
    if (data.title !== undefined) update.title = data.title;
    if (data.interviewer !== undefined) update.interviewer = data.interviewer?.trim() || null;
    if (data.candidateId !== undefined || data.interviewId !== undefined) {
      // A saved guide is never on anybody: it is USED for an interview, which
      // copies it (POST ./use), so the saved one stays for the next interview.
      const saved = await prisma.interviewGuide.findUnique({ where: { id }, select: { isTemplate: true } });
      if (saved?.isTemplate) {
        return NextResponse.json({ message: "A saved guide is not linked to an interview. Use it for one instead." }, { status: 400 });
      }
      const link = await resolveLink(
        auth.user,
        data.candidateId === undefined ? access.candidateId : data.candidateId,
        data.interviewId ?? null
      );
      if ("response" in link) return link.response;
      update.candidateId = link.candidateId;
      update.interviewId = link.interviewId;
    }
    await prisma.interviewGuide.update({ where: { id }, data: update });
    const guide = await getInterviewGuide(id, auth.user.viewer);
    return NextResponse.json({ ok: true, guide });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: error.issues[0]?.message ?? "Validation failed.", issues: error.issues }, { status: 400 });
    }
    console.error("Update interview guide failed:", error);
    return NextResponse.json({ message: "Unable to save the guide." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return authFailureResponse(auth);
  const { id } = await params;
  const access = await resolveGuideWrite(auth.user, id);
  if ("response" in access) return access.response;

  const guide = await prisma.interviewGuide.findUnique({ where: { id }, select: { title: true, _count: { select: { items: true } } } });
  await prisma.interviewGuide.delete({ where: { id } });
  // Recorded because a question-bank delete once left no trace of who or when.
  await logActivity({
    userId: auth.user.id ?? undefined,
    userEmail: auth.user.email ?? undefined,
    activityType: "INTERVIEW_UPDATED",
    description: `Interview guide deleted: ${guide?.title ?? id} (${guide?._count.items ?? 0} questions)`,
    entityType: "InterviewGuide",
    entityId: id
  });
  return NextResponse.json({ ok: true });
}
