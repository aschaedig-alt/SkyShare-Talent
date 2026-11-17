import { prisma } from "@/lib/prisma";
import { parseCoreValues, parseGuidance } from "@/lib/interview-questions/rich";

/**
 * The question copies a guide is made of. Wording and guidance are COPIED from
 * the bank, so a later edit to the bank never changes what was asked in an
 * interview that already happened.
 */
export type GuideItemCopy = {
  questionId: string | null;
  text: string;
  category: string | null;
  coreValuesJson: string;
  strongAnswer: string | null;
  listenFor: string | null;
};

/**
 * Copies of the given bank questions, in the order given. Ids no longer in the
 * bank are dropped, never invented. Duplicates are dropped too.
 */
export async function copiesFromBank(questionIds: string[]): Promise<GuideItemCopy[]> {
  const ids = [...new Set(questionIds)];
  if (ids.length === 0) return [];
  const rows = await prisma.interviewQuestion.findMany({ where: { id: { in: ids } } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const q = byId.get(id);
    if (!q) return [];
    const g = parseGuidance(q.guidance);
    return [
      {
        questionId: q.id,
        text: q.text,
        category: q.category,
        coreValuesJson: JSON.stringify(parseCoreValues(q.coreValue)),
        strongAnswer: g.strongAnswer || null,
        listenFor: g.listenFor || null
      }
    ];
  });
}

/**
 * The copies for one interview, made from a SAVED guide.
 *
 * Each question is re-read from the bank, so a wording fixed in the bank since
 * the guide was saved is what gets asked. A question since DELETED from the
 * bank is left out, the same as the guide's editor leaves it out: deleting a
 * question from the bank is a decision that it should not be asked (the
 * "passion" question, deleted on purpose Nov 16 2026, was the first case).
 * The saved guide's page says how many it has lost this way.
 */
export async function copiesFromSavedGuide(guideId: string): Promise<GuideItemCopy[]> {
  const items = await prisma.interviewGuideItem.findMany({ where: { guideId }, orderBy: { sortOrder: "asc" } });
  return copiesFromBank(items.map((i) => i.questionId).filter((id): id is string => Boolean(id)));
}
