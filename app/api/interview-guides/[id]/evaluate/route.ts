import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, authFailureResponse } from "@/lib/auth/route-auth";
import { resolveGuideWrite } from "@/lib/interview-guides/access.server";
import { evaluateAnswers } from "@/lib/interview-guides/evaluate.server";
import { lessonsFor } from "@/lib/interview-guides/learning.server";
import { getInterviewGuide } from "@/lib/data/interview-guides";
import { parseStringArray } from "@/lib/json";
import { storedToPlain } from "@/lib/richtext/stored";
import { splitValues, valuesSetByHand } from "@/lib/interview-guides/values";

// One model call over every answered question; a long guide can take a while.
export const maxDuration = 120;

/**
 * Draft-judge the answers on a guide: a rating and the core values each answer
 * showed. Each half is applied only where the interviewer has not set it by
 * hand, so a hand-set rating keeps its rating but can still get values, and the
 * other way round. The interviewer's past corrections go in as examples.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return authFailureResponse(auth);
  const { id } = await params;
  const access = await resolveGuideWrite(auth.user, id);
  if ("response" in access) return access.response;

  const items = await prisma.interviewGuideItem.findMany({ where: { guideId: id }, orderBy: { sortOrder: "asc" } });
  const plan = items
    // A question marked Not asked is never judged.
    .filter((it) => !it.skipped && storedToPlain(it.answer).trim())
    .map((it) => {
      const shown = parseStringArray(it.shownValuesJson);
      const removed = parseStringArray(it.removedValuesJson);
      return {
        it,
        rate: it.evaluationSource !== "INTERVIEWER",
        values: !valuesSetByHand(it.valuesSource, shown, removed)
      };
    })
    .filter((p) => p.rate || p.values);
  if (plan.length === 0) {
    return NextResponse.json(
      { message: "Type at least one answer first. Ratings and values you set yourself are left as you set them." },
      { status: 400 }
    );
  }

  try {
    const lessons = await lessonsFor();
    const results = await evaluateAnswers(
      plan.map(({ it }) => ({
        id: it.id,
        text: it.text,
        strongAnswer: it.strongAnswer ?? "",
        listenFor: it.listenFor ?? "",
        coreValues: parseStringArray(it.coreValuesJson),
        answer: it.answer ?? ""
      })),
      lessons
    );
    const byId = new Map(plan.map((p) => [p.it.id, p]));
    const now = new Date();
    await prisma.$transaction(
      results.map((r) => {
        const p = byId.get(r.id)!;
        const data: Record<string, unknown> = {};
        if (p.rate) Object.assign(data, { strength: r.strength, evaluationNote: r.note || null, evaluationSource: "AI", evaluatedAt: now });
        if (p.values) {
          const { shown, removed } = splitValues(parseStringArray(p.it.coreValuesJson), r.values);
          Object.assign(data, {
            shownValuesJson: shown.length ? JSON.stringify(shown) : null,
            removedValuesJson: removed.length ? JSON.stringify(removed) : null,
            valuesSource: "AI",
            valuesNote: r.valuesNote || null
          });
        }
        return prisma.interviewGuideItem.update({ where: { id: r.id }, data });
      })
    );
    const guide = await getInterviewGuide(id, auth.user.viewer);
    return NextResponse.json({ ok: true, judged: results.length, lessonsUsed: lessons.length, guide });
  } catch (error) {
    console.error("Evaluate guide answers failed:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "Could not evaluate the answers." }, { status: 502 });
  }
}
