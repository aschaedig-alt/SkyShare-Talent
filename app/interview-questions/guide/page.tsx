import { GuideBuilder } from "@/components/interview-questions/GuideBuilder";
import { getInterviewQuestions } from "@/lib/data/interview-questions";
import { requireModulePageAccess } from "@/lib/data/module-access";

export const dynamic = "force-dynamic";

export default async function InterviewGuidePage() {
  await requireModulePageAccess("interview-questions");
  const questions = await getInterviewQuestions();
  return <GuideBuilder questions={questions} />;
}
