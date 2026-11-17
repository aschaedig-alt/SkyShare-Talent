import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission, requireApiUser, authFailureResponse } from "@/lib/auth/route-auth";
import { guideCreateSchema } from "@/lib/validation/interview-guide";
import { canWriteGuideFor, forbidden, resolveLink } from "@/lib/interview-guides/access.server";
import { copiesFromBank } from "@/lib/interview-guides/items.server";
import { getSavedGuideOptions } from "@/lib/data/interview-guides";
import { logActivity } from "@/lib/activity/logger";

/** The saved guides, for the "Add a saved guide" picker on an interview. */
export async function GET() {
  const auth = await requireApiPermission("calendar:read");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  return NextResponse.json({ guides: await getSavedGuideOptions() });
}

/**
 * Save a guide: the picked bank questions, COPIED (wording and guidance) so a
 * later edit to the bank never changes what was asked in this interview.
 *
 * asTemplate saves a SAVED guide instead: reusable, on nobody, picked per
 * interview from the interview or the guide's own page.
 */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return authFailureResponse(auth);

  try {
    const data = guideCreateSchema.parse(await request.json());

    let candidateId: string | null = null;
    let interviewId: string | null = null;
    if (data.asTemplate) {
      // Nobody to check an allowlist against, so the bank's own permission.
      if (!canWriteGuideFor(auth.user, null)) return forbidden();
    } else {
      const link = await resolveLink(auth.user, data.candidateId, data.interviewId);
      if ("response" in link) return link.response;
      candidateId = link.candidateId;
      interviewId = link.interviewId;
    }

    const copies = await copiesFromBank(data.questionIds);
    if (copies.length === 0) return NextResponse.json({ message: "None of those questions are in the bank any more." }, { status: 400 });

    let title = data.title?.trim();
    if (!title && data.asTemplate) return NextResponse.json({ message: "Give the guide a name." }, { status: 400 });
    if (!title) {
      const who = candidateId
        ? (await prisma.candidate.findUnique({ where: { id: candidateId }, select: { displayName: true } }))?.displayName
        : null;
      title = who ? `Interview guide — ${who}` : "Interview guide";
    }

    const guide = await prisma.interviewGuide.create({
      data: {
        title,
        isTemplate: Boolean(data.asTemplate),
        candidateId,
        interviewId,
        departmentKey: data.departmentKey ?? null,
        // A saved guide has no interviewer: whoever uses it is the interviewer.
        interviewer: data.asTemplate ? null : data.interviewer?.trim() || auth.user.name || null,
        createdBy: auth.user.email,
        items: { create: copies.map((c, i) => ({ ...c, sortOrder: i })) }
      },
      select: { id: true }
    });

    await logActivity({
      userId: auth.user.id ?? undefined,
      userEmail: auth.user.email ?? undefined,
      activityType: "INTERVIEW_UPDATED",
      description: `${data.asTemplate ? "Saved interview guide created" : "Interview guide saved"} with ${copies.length} question${copies.length === 1 ? "" : "s"}: ${title}`,
      entityType: "InterviewGuide",
      entityId: guide.id
    });

    return NextResponse.json({ ok: true, id: guide.id });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: error.issues[0]?.message ?? "Validation failed.", issues: error.issues }, { status: 400 });
    }
    console.error("Create interview guide failed:", error);
    return NextResponse.json({ message: "Unable to save the guide." }, { status: 500 });
  }
}
