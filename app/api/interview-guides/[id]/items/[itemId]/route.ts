import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUser, authFailureResponse } from "@/lib/auth/route-auth";
import { guideItemUpdateSchema } from "@/lib/validation/interview-guide";
import { resolveGuideWrite } from "@/lib/interview-guides/access.server";
import { parseStringArray } from "@/lib/json";
import { answerValues, splitValues, VALUE_KEYS } from "@/lib/interview-guides/values";
import { recordCorrection } from "@/lib/interview-guides/learning.server";

/**
 * Save one question's answer, set its rating by hand, or set which core values
 * the answer showed. Anything set here is marked INTERVIEWER, and the draft
 * evaluator never overwrites those.
 *
 * Editing the ANSWER clears whatever the evaluator said about it (rating and
 * values), since it judged the old words.
 *
 * Changing a call the evaluator made is recorded as a lesson it reads on later
 * runs (lib/interview-guides/learning.server.ts).
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

    const asked = parseStringArray(item.coreValuesJson);
    const shownBefore = parseStringArray(item.shownValuesJson);
    const removedBefore = parseStringArray(item.removedValuesJson);
    const valuesBefore = answerValues(asked, shownBefore, removedBefore);

    const update: {
      answer?: string | null;
      strength?: string | null;
      evaluationNote?: string | null;
      evaluationSource?: string | null;
      evaluatedAt?: Date | null;
      shownValuesJson?: string | null;
      removedValuesJson?: string | null;
      valuesSource?: string | null;
      valuesNote?: string | null;
    } = {};

    if (data.answer !== undefined) {
      update.answer = data.answer;
      if ((data.answer ?? "") !== (item.answer ?? "")) {
        if (item.evaluationSource === "AI") {
          update.strength = null;
          update.evaluationNote = null;
          update.evaluationSource = null;
          update.evaluatedAt = null;
        }
        if (item.valuesSource === "AI") {
          update.shownValuesJson = null;
          update.removedValuesJson = null;
          update.valuesSource = null;
          update.valuesNote = null;
        }
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

    // The answer's values: `values` is the whole set (lets an asked value be
    // unticked); `shownValues` is the older extras-only form, still accepted.
    let valuesAfter: string[] | null = null;
    if (data.values !== undefined) {
      const picked = new Set<string>(data.values);
      valuesAfter = VALUE_KEYS.filter((k) => picked.has(k));
    } else if (data.shownValues !== undefined) {
      valuesAfter = answerValues(asked, data.shownValues, removedBefore);
    }
    if (valuesAfter) {
      const { shown, removed } = splitValues(asked, valuesAfter);
      update.shownValuesJson = shown.length ? JSON.stringify(shown) : null;
      update.removedValuesJson = removed.length ? JSON.stringify(removed) : null;
      update.valuesSource = "INTERVIEWER";
      if (item.valuesSource === "AI") update.valuesNote = null;
    }

    const saved = await prisma.interviewGuideItem.update({ where: { id: itemId }, data: update });
    await prisma.interviewGuide.update({ where: { id }, data: { updatedAt: new Date() } });

    // Lessons for the evaluator. Best effort: a failure here must not lose the save.
    try {
      if (data.strength !== undefined && (item.evaluationSource === "AI" || item.evaluationSource === "INTERVIEWER")) {
        await recordCorrection({
          kind: "STRENGTH",
          item: saved,
          fromAi: item.evaluationSource === "AI",
          aiValue: item.strength ?? "NONE",
          aiNote: item.evaluationNote,
          humanValue: data.strength ?? "NONE",
          createdBy: auth.user.email
        });
      }
      // From AI: a new lesson. Already the interviewer's: updates a lesson only
      // if one exists for this answer (recordCorrection never creates then).
      if (valuesAfter && (item.valuesSource === "AI" || item.valuesSource === "INTERVIEWER")) {
        await recordCorrection({
          kind: "VALUES",
          item: saved,
          fromAi: item.valuesSource === "AI",
          aiValue: JSON.stringify(valuesBefore),
          aiNote: item.valuesNote,
          humanValue: JSON.stringify(valuesAfter),
          createdBy: auth.user.email
        });
      }
    } catch (lessonError) {
      console.error("Recording an evaluator lesson failed:", lessonError);
    }

    const shown = parseStringArray(saved.shownValuesJson);
    const removed = parseStringArray(saved.removedValuesJson);
    return NextResponse.json({
      ok: true,
      item: {
        id: saved.id,
        answer: saved.answer,
        strength: saved.strength,
        evaluationNote: saved.evaluationNote,
        evaluationSource: saved.evaluationSource,
        evaluatedAt: saved.evaluatedAt?.toISOString() ?? null,
        shownValues: shown,
        removedValues: removed,
        values: answerValues(asked, shown, removed),
        valuesSource: saved.valuesSource,
        valuesNote: saved.valuesNote
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
