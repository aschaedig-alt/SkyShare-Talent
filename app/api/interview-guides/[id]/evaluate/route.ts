import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, authFailureResponse } from "@/lib/auth/route-auth";
import { resolveGuideWrite } from "@/lib/interview-guides/access.server";
import { evaluateAnswers } from "@/lib/interview-guides/evaluate.server";
import { getInterviewGuide } from "@/lib/data/interview-guides";
import { parseStringArray } from "@/lib/json";
import { storedToPlain } from "@/lib/richtext/stored";

// One model call over every answered question; a long guide can take a while.
export const maxDuration = 120;

/**
 * Draft-judge the answers on a guide. Only questions with an answer typed and
 * no hand-set judgement are sent; an interviewer's own call is left alone.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return authFailureResponse(auth);
  const { id } = await params;
  const access = await resolveGuideWrite(auth.user, id);
  if ("response" in access) return access.response;

  const items = await prisma.interviewGuideItem.findMany({ where: { guideId: id }, orderBy: { sortOrder: "asc" } });
  const toJudge = items.filter((it) => storedToPlain(it.answer).trim() && it.evaluationSource !== "INTERVIEWER");
  if (toJudge.length === 0) {
    return NextResponse.json(
      { message: "Type at least one answer first. Questions you judged yourself are left as you set them." },
      { status: 400 }
    );
  }

  try {
    const results = await evaluateAnswers(
      toJudge.map((it) => ({
        id: it.id,
        text: it.text,
        strongAnswer: it.strongAnswer ?? "",
        listenFor: it.listenFor ?? "",
        coreValues: parseStringArray(it.coreValuesJson),
        answer: it.answer ?? ""
      }))
    );
    const now = new Date();
    await prisma.$transaction(
      results.map((r) =>
        prisma.interviewGuideItem.update({
          where: { id: r.id },
          data: { strength: r.strength, evaluationNote: r.note || null, evaluationSource: "AI", evaluatedAt: now }
        })
      )
    );
    const guide = await getInterviewGuide(id, auth.user.viewer);
    return NextResponse.json({ ok: true, judged: results.length, guide });
  } catch (error) {
    console.error("Evaluate guide answers failed:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "Could not evaluate the answers." }, { status: 502 });
  }
}
