import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { LESSONS_PER_RUN } from "@/lib/interview-guides/learning.server";

// GET /api/interview-guides/corrections
// What the draft evaluator has learned: the interviewer's corrections of its
// calls, newest first. The newest LESSONS_PER_RUN are the ones it reads.
//
// The question and the answer are copied text from a guide, so this route is
// for people who may write guides (calendar:write), and it is not candidate
// scoped: a lesson carries no candidate id on purpose.
export async function GET() {
  const auth = await requireApiPermission("calendar:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const rows = await prisma.interviewEvalCorrection.findMany({
    where: { active: true },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: { id: true, kind: true, questionText: true, answerText: true, askedJson: true, aiValue: true, humanValue: true, createdBy: true, updatedAt: true }
  });
  return NextResponse.json({
    perRun: LESSONS_PER_RUN,
    corrections: rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }))
  });
}
