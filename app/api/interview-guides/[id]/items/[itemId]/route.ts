import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUser, authFailureResponse } from "@/lib/auth/route-auth";
import { guideItemUpdateSchema } from "@/lib/validation/interview-guide";
import { resolveGuideWrite } from "@/lib/interview-guides/access.server";
import { parseStringArray } from "@/lib/json";

/**
 * Save one question's answer, or set its judgement by hand. A judgement set
 * here is marked INTERVIEWER, and the draft judge never overwrites those.
 * Editing the ANSWER clears an AI judgement, since it judged the old words.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return authFailureResponse(auth);
  const { id, itemId } = await params;
  const access = await resolveGuideWrite(auth.user, id);
  if ("response" in access) return access.response;

  try {
    const data = guideItemUpdateSchema.parse(await request.json());
    const item = await prisma.interviewGuideItem.findFirst({ where: { id: itemId, guideId: id } });
    if (!item) return NextResponse.json({ message: "Question not found on this guide." }, { status: 404 });

    const update: {
      answer?: string | null;
      strength?: string | null;
      evaluationNote?: string | null;
      evaluationSource?: string | null;
      evaluatedAt?: Date | null;
      shownValuesJson?: string | null;
    } = {};
    if (data.answer !== undefined) {
      update.answer = data.answer;
      if ((data.answer ?? "") !== (item.answer ?? "") && item.evaluationSource === "AI") {
        update.strength = null;
        update.evaluationNote = null;
        update.evaluationSource = null;
        update.evaluatedAt = null;
      }
    }
    if (data.strength !== undefined) {
      update.strength = data.strength;
      update.evaluationSource = data.strength ? "INTERVIEWER" : null;
      update.evaluatedAt = data.strength ? new Date() : null;
      // The AI's reason no longer describes a judgement somebody replaced by hand.
      if (data.evaluationNote === undefined && item.evaluationSource === "AI") update.evaluationNote = null;
    }
    if (data.evaluationNote !== undefined) update.evaluationNote = data.evaluationNote?.trim() || null;
    if (data.shownValues !== undefined) {
      const asked = new Set(parseStringArray(item.coreValuesJson));
      const extra = [...new Set(data.shownValues)].filter((v) => !asked.has(v));
      update.shownValuesJson = extra.length ? JSON.stringify(extra) : null;
    }

    const saved = await prisma.interviewGuideItem.update({ where: { id: itemId }, data: update });
    await prisma.interviewGuide.update({ where: { id }, data: { updatedAt: new Date() } });
    return NextResponse.json({
      ok: true,
      item: {
        id: saved.id,
        answer: saved.answer,
        strength: saved.strength,
        evaluationNote: saved.evaluationNote,
        evaluationSource: saved.evaluationSource,
        evaluatedAt: saved.evaluatedAt?.toISOString() ?? null,
        shownValues: parseStringArray(saved.shownValuesJson)
      }
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: error.issues[0]?.message ?? "Validation failed.", issues: error.issues }, { status: 400 });
    }
    console.error("Update guide answer failed:", error);
    return NextResponse.json({ message: "Unable to save the answer." }, { status: 500 });
  }
}
