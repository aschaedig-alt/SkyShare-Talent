import { prisma } from "@/lib/prisma";
import { storedToPlain } from "@/lib/richtext/stored";
import { questionPlain } from "@/lib/interview-questions/rich";

// How the draft answer evaluator "learns" (Nov 16 2026: "When I change things
// over time, it learns what I changed and stores that info for future
// evaluations").
//
// Honestly described: nothing is trained. When the interviewer changes a call the
// evaluator made — an answer's rating, or which core values it showed — the pair
// (what the evaluator said, what he changed it to) is stored here with the
// question and the answer. On every later run the evaluator is shown the most
// recent of these as worked examples and told to follow them. Removing a row
// (active = false) makes it forget that lesson.
//
// One row per question per kind: changing the same answer twice updates the row
// instead of adding a second lesson. If he puts it back to what the evaluator
// said, the row goes inactive (there is nothing to learn).

export type CorrectionKind = "STRENGTH" | "VALUES";

/** How many past corrections the evaluator reads on each run. */
export const LESSONS_PER_RUN = 25;

type ItemForLesson = {
  id: string;
  guideId: string;
  text: string;
  answer: string | null;
  coreValuesJson: string | null;
};

/**
 * Record a change the interviewer made. `fromAi` is true when the value being
 * replaced was the evaluator's; only then is a NEW lesson made. A later change to
 * the same answer updates the lesson already there.
 */
export async function recordCorrection(args: {
  kind: CorrectionKind;
  item: ItemForLesson;
  fromAi: boolean;
  aiValue: string;
  aiNote: string | null;
  humanValue: string;
  createdBy: string | null;
}): Promise<void> {
  const existing = await prisma.interviewEvalCorrection.findFirst({
    where: { itemId: args.item.id, kind: args.kind },
    orderBy: { createdAt: "desc" }
  });
  if (existing) {
    await prisma.interviewEvalCorrection.update({
      where: { id: existing.id },
      data: {
        humanValue: args.humanValue,
        answerText: storedToPlain(args.item.answer).slice(0, 2000),
        active: existing.aiValue !== args.humanValue
      }
    });
    return;
  }
  if (!args.fromAi || args.aiValue === args.humanValue) return;
  await prisma.interviewEvalCorrection.create({
    data: {
      kind: args.kind,
      guideId: args.item.guideId,
      itemId: args.item.id,
      questionText: questionPlain(args.item.text).slice(0, 1000),
      answerText: storedToPlain(args.item.answer).slice(0, 2000),
      askedJson: args.item.coreValuesJson,
      aiValue: args.aiValue,
      humanValue: args.humanValue,
      aiNote: args.aiNote,
      createdBy: args.createdBy
    }
  });
}

/** When the evaluator re-judges an answer, an old lesson from that same answer is no longer about what it just said. */
export async function lessonsFor(limit = LESSONS_PER_RUN) {
  return prisma.interviewEvalCorrection.findMany({
    where: { active: true },
    orderBy: { updatedAt: "desc" },
    take: limit
  });
}

export async function lessonCount(): Promise<number> {
  return prisma.interviewEvalCorrection.count({ where: { active: true } });
}
