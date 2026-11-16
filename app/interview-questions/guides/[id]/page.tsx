import { notFound } from "next/navigation";
import { GuideSession } from "@/components/interview-guides/GuideSession";
import { getInterviewGuide } from "@/lib/data/interview-guides";
import { requireModulePageAccess } from "@/lib/data/module-access";

export const dynamic = "force-dynamic";

export default async function InterviewGuideSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireModulePageAccess("interview-questions");
  const { id } = await params;
  // null for an off-allowlist candidate too, so both land on the same 404.
  const guide = await getInterviewGuide(id, access.viewer);
  if (!guide) notFound();
  return <GuideSession initial={guide} />;
}
