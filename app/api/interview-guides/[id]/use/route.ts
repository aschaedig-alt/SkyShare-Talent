import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUser, authFailureResponse } from "@/lib/auth/route-auth";
import { guideUseSchema } from "@/lib/validation/interview-guide";
import { resolveLink } from "@/lib/interview-guides/access.server";
import { copiesFromSavedGuide } from "@/lib/interview-guides/items.server";
import { logActivity } from "@/lib/activity/logger";

/**
 * Use a SAVED guide for one interview: copy its questions into a new guide on
 * that interview, ready for answers. The saved guide itself is not changed and
 * stays on the Saved guides tab for the next interview.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return authFailureResponse(auth);
  const { id } = await params;

  try {
    const data = guideUseSchema.parse(await request.json());
    const saved = await prisma.interviewGuide.findUnique({ where: { id }, select: { isTemplate: true, title: true, departmentKey: true } });
    if (!saved || !saved.isTemplate) return NextResponse.json({ message: "That saved guide no longer exists." }, { status: 404 });

    const link = await resolveLink(auth.user, data.candidateId, data.interviewId);
    if ("response" in link) return link.response;

    const copies = await copiesFromSavedGuide(id);
    if (copies.length === 0) return NextResponse.json({ message: "That saved guide has no questions." }, { status: 400 });

    const who = link.candidateId
      ? (await prisma.candidate.findUnique({ where: { id: link.candidateId }, select: { displayName: true } }))?.displayName
      : null;
    const title = who ? `${saved.title} — ${who}` : saved.title;

    const guide = await prisma.interviewGuide.create({
      data: {
        title,
        isTemplate: false,
        candidateId: link.candidateId,
        interviewId: link.interviewId,
        departmentKey: saved.departmentKey,
        interviewer: data.interviewer?.trim() || auth.user.name || null,
        createdBy: auth.user.email,
        items: { create: copies.map((c, i) => ({ ...c, sortOrder: i })) }
      },
      select: { id: true }
    });

    await logActivity({
      userId: auth.user.id ?? undefined,
      userEmail: auth.user.email ?? undefined,
      activityType: "INTERVIEW_UPDATED",
      description: `Saved guide "${saved.title}" used for an interview: ${title} (${copies.length} questions)`,
      entityType: "InterviewGuide",
      entityId: guide.id
    });

    return NextResponse.json({ ok: true, id: guide.id });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: error.issues[0]?.message ?? "Validation failed.", issues: error.issues }, { status: 400 });
    }
    console.error("Use saved interview guide failed:", error);
    return NextResponse.json({ message: "Unable to add the guide." }, { status: 500 });
  }
}
