import { notFound } from "next/navigation";
import { GuideSession } from "@/components/interview-guides/GuideSession";
import { GuideBuilder } from "@/components/interview-questions/GuideBuilder";
import { UseSavedGuide } from "@/components/interview-guides/AddSavedGuide";
import { getInterviewGuide } from "@/lib/data/interview-guides";
import { getInterviewQuestions } from "@/lib/data/interview-questions";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { questionPlain } from "@/lib/interview-questions/rich";

export const dynamic = "force-dynamic";

export default async function InterviewGuideSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireModulePageAccess("interview-questions");
  const { id } = await params;
  // null for an off-allowlist candidate too, so both land on the same 404.
  const guide = await getInterviewGuide(id, access.viewer);
  if (!guide) notFound();

  // A SAVED guide is edited, not answered: the builder, loaded with its
  // questions, plus a panel to use it for an interview.
  if (guide.isTemplate) {
    const questions = await getInterviewQuestions();
    // Questions deleted from the bank since this guide was saved are not
    // asked (lib/interview-guides/items.server.ts). Say so rather than let
    // the count change silently.
    const inBank = new Set(questions.map((q) => q.id));
    const gone = guide.items.filter((i) => !i.questionId || !inBank.has(i.questionId));
    return (
      <GuideBuilder
        // Remount after a save so the builder starts from what was stored.
        key={guide.updatedAt}
        questions={questions}
        initialPick={guide.items.map((i) => i.questionId).filter((q): q is string => Boolean(q))}
        editing={{ id: guide.id, title: guide.title, departmentKey: guide.departmentKey }}
        top={
          <>
            <UseSavedGuide guideId={guide.id} title={guide.title} />
            {gone.length > 0 ? (
              <p className="rounded bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                {gone.length} question{gone.length === 1 ? " on this guide was" : "s on this guide were"} deleted from the question bank
                and {gone.length === 1 ? "is" : "are"} no longer asked: {gone.map((g) => `“${questionPlain(g.text).slice(0, 60)}”`).join(", ")}.
                Saving changes removes {gone.length === 1 ? "it" : "them"} from the guide for good.
              </p>
            ) : null}
          </>
        }
      />
    );
  }

  return <GuideSession initial={guide} />;
}
