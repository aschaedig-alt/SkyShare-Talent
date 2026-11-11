import { prisma } from "@/lib/prisma";
import { parseCoreValues, parseGuidance } from "@/lib/interview-questions/rich";

export type InterviewQuestionItem = {
  id: string;
  /** Rich-text HTML, or plain text for questions saved before Nov 2026 — read it with questionHtml/questionPlain. */
  text: string;
  category: string;
  /** colorKeys from COMPANY_VALUES; a question can suit several. */
  coreValues: string[];
  departments: string[];
  /** "What a strong answer looks like" — rich-text HTML, "" when empty. */
  strongAnswer: string;
  /** What the interviewer should listen for — rich-text HTML, "" when empty. */
  listenFor: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

function parseDepartments(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/**
 * The bank in its saved order: active first, then sortOrder (which the bank's
 * drag/arrow reorder writes), newest first as the tie-break. Category is no
 * longer part of the order — it was, which made a hand-set order impossible.
 */
export async function getInterviewQuestions(): Promise<InterviewQuestionItem[]> {
  const rows = await prisma.interviewQuestion.findMany({
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }]
  });
  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    category: row.category,
    coreValues: parseCoreValues(row.coreValue),
    departments: parseDepartments(row.departmentsJson),
    ...parseGuidance(row.guidance),
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  }));
}
