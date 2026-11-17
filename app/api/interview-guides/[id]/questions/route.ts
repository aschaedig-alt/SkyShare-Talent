import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUser, authFailureResponse } from "@/lib/auth/route-auth";
import { guideQuestionsSchema } from "@/lib/validation/interview-guide";
import { resolveGuideWrite } from "@/lib/interview-guides/access.server";
import { copiesFromBank } from "@/lib/interview-guides/items.server";
import { getInterviewGuide } from "@/lib/data/interview-guides";
import { logActivity } from "@/lib/activity/logger";

/**
 * Edit a SAVED guide: replace its questions, in order, and optionally rename it.
 *
 * Saved guides only. A guide already used in an interview holds answers typed
 * against each question, and swapping its questions out would orphan them, so
 * that is refused rather than half-done. Guides already used for an interview
 * are untouched by an edit here: they hold their own copies.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return authFailureResponse(auth);
  const { id } = await params;
  const access = await resolveGuideWrite(auth.user, id);
  if ("response" in access) return access.response;

  try {
    const data = guideQuestionsSchema.parse(await request.json());
    const existing = await prisma.interviewGuide.findUnique({
      where: { id },
      select: { isTemplate: true, title: true, _count: { select: { items: true } } }
    });
    if (!existing) return NextResponse.json({ message: "Guide not found." }, { status: 404 });
    if (!existing.isTemplate) {
      return NextResponse.json({ message: "Only a saved guide's questions can be edited. This one was used in an interview." }, { status: 400 });
    }

    const copies = await copiesFromBank(data.questionIds);
    if (copies.length === 0) return NextResponse.json({ message: "None of those questions are in the bank any more." }, { status: 400 });

    await prisma.$transaction([
      prisma.interviewGuideItem.deleteMany({ where: { guideId: id } }),
      prisma.interviewGuide.update({
        where: { id },
        data: {
          ...(data.title ? { title: data.title } : {}),
          ...(data.departmentKey !== undefined ? { departmentKey: data.departmentKey } : {}),
          items: { create: copies.map((c, i) => ({ ...c, sortOrder: i })) }
        }
      })
    ]);

    await logActivity({
      userId: auth.user.id ?? undefined,
      userEmail: auth.user.email ?? undefined,
      activityType: "INTERVIEW_UPDATED",
      description: `Saved interview guide edited: ${existing.title}${data.title && data.title !== existing.title ? ` → ${data.title}` : ""} (${existing._count.items} → ${copies.length} questions)`,
      entityType: "InterviewGuide",
      entityId: id
    });

    return NextResponse.json({ ok: true, guide: await getInterviewGuide(id, auth.user.viewer) });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: error.issues[0]?.message ?? "Validation failed.", issues: error.issues }, { status: 400 });
    }
    console.error("Edit saved interview guide failed:", error);
    return NextResponse.json({ message: "Unable to save the guide." }, { status: 500 });
  }
}
