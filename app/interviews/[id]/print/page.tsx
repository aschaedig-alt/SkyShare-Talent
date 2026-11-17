import { notFound } from "next/navigation";
import { InterviewPrintSheet } from "@/components/interviews/InterviewPrintSheet";
import { getInterviewDetail } from "@/lib/data/interview-detail";
import { requireModulePageAccess } from "@/lib/data/module-access";

export const dynamic = "force-dynamic";

// /interviews/<id>/print — the interview laid out for paper, to print or save as
// a PDF from the browser's print dialog (Nov 17 2026: "share the interview data
// from chase anderson with our new chief pilot and i want it to look good").
// Same gate and the same candidate scoping as the full interview page.
export default async function InterviewPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireModulePageAccess("calendar");
  const { id } = await params;
  const detail = await getInterviewDetail(id, access.viewer);
  if (!detail) notFound();
  return <InterviewPrintSheet detail={detail} />;
}
