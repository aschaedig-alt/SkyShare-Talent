import { InterviewQuestionsWorkspace } from "@/components/interview-questions/InterviewQuestionsWorkspace";
import { getInterviewQuestions } from "@/lib/data/interview-questions";
import { requireModulePageAccess } from "@/lib/data/module-access";

export const dynamic = "force-dynamic";

export default async function InterviewQuestionsPage() {
  await requireModulePageAccess("interview-questions");
  const questions = await getInterviewQuestions();
  return <InterviewQuestionsWorkspace questions={questions} />;
}
