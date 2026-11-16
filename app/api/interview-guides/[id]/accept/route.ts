import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, authFailureResponse } from "@/lib/auth/route-auth";
import { resolveGuideWrite } from "@/lib/interview-guides/access.server";
import { getInterviewGuide } from "@/lib/data/interview-guides";

/**
 * POST — accept every draft suggestion on a guide (Nov 16 2026: he looked a
 * guide over and approved it, but every rating and value stayed "(draft)",
 * because only clicking one by one confirmed them).
 *
 * Nothing changes except who owns each call: AI becomes INTERVIEWER, so the
 * "(draft)" label goes and the evaluator leaves them alone after. Accepting is
 * agreement, so it records no lesson for the evaluator.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return authFailureResponse(auth);
  const { id } = await params;
  const access = await resolveGuideWrite(auth.user, id);
  if ("response" in access) return access.response;

  const [ratings, values] = await prisma.$transaction([
    prisma.interviewGuideItem.updateMany({ where: { guideId: id, evaluationSource: "AI" }, data: { evaluationSource: "INTERVIEWER" } }),
    prisma.interviewGuideItem.updateMany({ where: { guideId: id, valuesSource: "AI" }, data: { valuesSource: "INTERVIEWER" } })
  ]);
  await prisma.interviewGuide.update({ where: { id }, data: { updatedAt: new Date() } });
  const guide = await getInterviewGuide(id, auth.user.viewer);
  return NextResponse.json({ ok: true, ratings: ratings.count, values: values.count, guide });
}
