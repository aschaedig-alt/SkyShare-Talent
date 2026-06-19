import { prisma } from "@/lib/prisma";

export type InterviewQuestionItem = {
  id: string;
  text: string;
  category: string;
  coreValue: string | null;
  departments: string[];
  guidance: string | null;
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

export async function getInterviewQuestions(): Promise<InterviewQuestionItem[]> {
  const rows = await prisma.interviewQuestion.findMany({
    orderBy: [{ isActive: "desc" }, { category: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }]
  });
  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    category: row.category,
    coreValue: row.coreValue,
    departments: parseDepartments(row.departmentsJson),
    guidance: row.guidance,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  }));
}
