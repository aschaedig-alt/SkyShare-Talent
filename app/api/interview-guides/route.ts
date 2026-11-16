import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUser, authFailureResponse } from "@/lib/auth/route-auth";
import { guideCreateSchema } from "@/lib/validation/interview-guide";
import { resolveLink } from "@/lib/interview-guides/access.server";
import { parseCoreValues, parseGuidance } from "@/lib/interview-questions/rich";
import { logActivity } from "@/lib/activity/logger";

/**
 * Save a guide: the picked bank questions, COPIED (wording and guidance) so a
 * later edit to the bank never changes what was asked in this interview.
 */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return authFailureResponse(auth);

  try {
    const data = guideCreateSchema.parse(await request.json());
    const link = await resolveLink(auth.user, data.candidateId, data.interviewId);
    if ("response" in link) return link.response;

    const ids = [...new Set(data.questionIds)];
    const rows = await prisma.interviewQuestion.findMany({ where: { id: { in: ids } } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r));
    if (ordered.length === 0) return NextResponse.json({ message: "None of those questions are in the bank any more." }, { status: 400 });

    let title = data.title?.trim();
    if (!title) {
      const who = link.candidateId
        ? (await prisma.candidate.findUnique({ where: { id: link.candidateId }, select: { displayName: true } }))?.displayName
        : null;
      title = who ? `Interview guide — ${who}` : "Interview guide";
    }

    const guide = await prisma.interviewGuide.create({
      data: {
        title,
        candidateId: link.candidateId,
        interviewId: link.interviewId,
        departmentKey: data.departmentKey ?? null,
        interviewer: data.interviewer?.trim() || auth.user.name || null,
        createdBy: auth.user.email,
        items: {
          create: ordered.map((q, i) => {
            const g = parseGuidance(q.guidance);
            return {
              questionId: q.id,
              sortOrder: i,
              text: q.text,
              category: q.category,
              coreValuesJson: JSON.stringify(parseCoreValues(q.coreValue)),
              strongAnswer: g.strongAnswer || null,
              listenFor: g.listenFor || null
            };
          })
        }
      },
      select: { id: true }
    });

    await logActivity({
      userId: auth.user.id ?? undefined,
      userEmail: auth.user.email ?? undefined,
      activityType: "INTERVIEW_UPDATED",
      description: `Interview guide saved with ${ordered.length} question${ordered.length === 1 ? "" : "s"}: ${title}`,
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

