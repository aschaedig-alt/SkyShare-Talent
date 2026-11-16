import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/prisma/generated/client/client";
import { parseStringArray } from "@/lib/json";
import type { ViewerScope } from "@/lib/auth/viewer-scope";
import { candidateScopeWhere, isCandidateVisible } from "@/lib/auth/candidate-scope";
import { isAnswerStrength, type AnswerStrength, type EvaluationSource } from "@/lib/interview-guides/constants";

export type GuideItemView = {
  id: string;
  questionId: string | null;
  text: string;
  category: string | null;
  /** The values the question was written for (from the bank, at save time). */
  coreValues: string[];
  /** Values the answer showed beyond those, ticked during the interview. */
  shownValues: string[];
  strongAnswer: string;
  listenFor: string;
  answer: string | null;
  strength: AnswerStrength | null;
  evaluationNote: string | null;
  evaluationSource: EvaluationSource | null;
  evaluatedAt: string | null;
};

export type GuideView = {
  id: string;
  title: string;
  departmentKey: string | null;
  interviewer: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  candidate: { id: string; displayName: string } | null;
  interview: { id: string; title: string; startDateTime: string; timezone: string | null } | null;
  items: GuideItemView[];
  /** How many questions have an answer typed in. */
  answered: number;
};

const guideInclude = {
  candidate: { select: { id: true, displayName: true } },
  interview: { select: { id: true, title: true, startDateTime: true, timezone: true } },
  items: { orderBy: { sortOrder: "asc" } }
} satisfies Prisma.InterviewGuideInclude;

type GuideRow = Prisma.InterviewGuideGetPayload<{ include: typeof guideInclude }>;

function toView(g: GuideRow): GuideView {
  const items: GuideItemView[] = g.items.map((it) => ({
    id: it.id,
    questionId: it.questionId,
    text: it.text,
    category: it.category,
    coreValues: parseStringArray(it.coreValuesJson),
    shownValues: parseStringArray(it.shownValuesJson),
    strongAnswer: it.strongAnswer ?? "",
    listenFor: it.listenFor ?? "",
    answer: it.answer,
    strength: isAnswerStrength(it.strength) ? it.strength : null,
    evaluationNote: it.evaluationNote,
    evaluationSource: it.evaluationSource === "AI" || it.evaluationSource === "INTERVIEWER" ? it.evaluationSource : null,
    evaluatedAt: it.evaluatedAt?.toISOString() ?? null
  }));
  return {
    id: g.id,
    title: g.title,
    departmentKey: g.departmentKey,
    interviewer: g.interviewer,
    createdBy: g.createdBy,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
    candidate: g.candidate,
    interview: g.interview
      ? { id: g.interview.id, title: g.interview.title, startDateTime: g.interview.startDateTime.toISOString(), timezone: g.interview.timezone }
      : null,
    items,
    answered: items.filter((i) => (i.answer ?? "").trim()).length
  };
}

/**
 * One guide, or null — the same answer for "no such guide" and "its candidate
 * is off your allowlist", so the page 404s either way (see interview-detail.ts
 * for why a 403 would leak that the person exists).
 */
export async function getInterviewGuide(id: string, viewer: ViewerScope | null): Promise<GuideView | null> {
  const g = await prisma.interviewGuide.findUnique({ where: { id }, include: guideInclude });
  if (!g) return null;
  if (g.candidateId && !isCandidateVisible(viewer, g.candidateId)) return null;
  return toView(g);
}

/** Every guide used in one interview, oldest first. Caller has already scoped the interview. */
export async function getGuidesForInterview(interviewId: string): Promise<GuideView[]> {
  const rows = await prisma.interviewGuide.findMany({ where: { interviewId }, include: guideInclude, orderBy: { createdAt: "asc" } });
  return rows.map(toView);
}

/** Saved guides, newest first, for the Saved guides tab. */
export async function getRecentGuides(viewer: ViewerScope | null, take = 100): Promise<GuideView[]> {
  const scope = candidateScopeWhere(viewer);
  const rows = await prisma.interviewGuide.findMany({
    // A scoped viewer sees only guides on candidates they may see; a guide not
    // yet linked to anybody is visible to everyone who can open the bank.
    where: scope ? { OR: [{ candidateId: null }, { candidate: scope }] } : undefined,
    include: guideInclude,
    orderBy: { updatedAt: "desc" },
    take
  });
  return rows.map(toView);
}
