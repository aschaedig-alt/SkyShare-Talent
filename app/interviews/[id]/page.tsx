import { notFound } from "next/navigation";
import { InterviewDetailWorkspace } from "@/components/interviews/InterviewDetailWorkspace";
import { getInterviewDetail } from "@/lib/data/interview-detail";
import { requireModulePageAccess } from "@/lib/data/module-access";

export const dynamic = "force-dynamic";

export default async function InterviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModulePageAccess("calendar");
  const { id } = await params;
  const detail = await getInterviewDetail(id);
  if (!detail) notFound();
  return <InterviewDetailWorkspace detail={detail} />;
}
