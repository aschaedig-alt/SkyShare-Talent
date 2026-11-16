import { GuideBuilder } from "@/components/interview-questions/GuideBuilder";
import { getInterviewQuestions } from "@/lib/data/interview-questions";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { prisma } from "@/lib/prisma";
import { isCandidateVisible } from "@/lib/auth/candidate-scope";

export const dynamic = "force-dynamic";

// ?q=id,id      questions ticked on the Question bank
// ?interviewId= arriving from an interview's "Build a guide for this interview"
export default async function InterviewGuidePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await requireModulePageAccess("interview-questions");
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

  const questions = await getInterviewQuestions();
  const initialPick = one(sp.q).split(",").map((s) => s.trim()).filter(Boolean);

  let initialCandidate: { id: string; displayName: string } | null = null;
  let initialInterviewId: string | null = null;
  const interviewId = one(sp.interviewId).trim();
  if (interviewId) {
    const interview = await prisma.interview.findUnique({
      where: { id: interviewId },
      select: { id: true, candidate: { select: { id: true, displayName: true } } }
    });
    // Same answer for "no such interview" and "not yours to see": just no prefill.
    if (interview && isCandidateVisible(access.viewer, interview.candidate.id)) {
      initialCandidate = interview.candidate;
      initialInterviewId = interview.id;
    }
  }

  return (
    <GuideBuilder
      questions={questions}
      initialPick={initialPick}
      initialCandidate={initialCandidate}
      initialInterviewId={initialInterviewId}
    />
  );
}
