import { notFound } from "next/navigation";
import { InterviewDetailWorkspace } from "@/components/interviews/InterviewDetailWorkspace";
import { getInterviewDetail } from "@/lib/data/interview-detail";
import { requireModulePageAccess } from "@/lib/data/module-access";

export const dynamic = "force-dynamic";

export default async function InterviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // Gated on CALENDAR, so the candidate allowlist has to be applied to the data
  // itself — see getInterviewDetail. It returns null for an off-allowlist
  // candidate, which lands on the same notFound() as a bad id.
  const access = await requireModulePageAccess("calendar");
  const { id } = await params;
  const detail = await getInterviewDetail(id, access.viewer);
  if (!detail) notFound();
  return <InterviewDetailWorkspace detail={detail} />;
}
