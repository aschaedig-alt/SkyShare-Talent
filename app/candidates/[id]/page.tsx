import { CandidateProfileWorkspace } from "@/components/candidates/CandidateProfileWorkspace";
import { getCandidateProfileData } from "@/lib/data/candidates";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getPageLayout } from "@/lib/data/page-layout";
import { notFound } from "next/navigation";

type CandidateDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CandidateDetailPage({ params }: CandidateDetailPageProps) {
  const access = await requireModulePageAccess("candidates");
  const { id } = await params;
  const [candidate, layout] = await Promise.all([getCandidateProfileData(id), getPageLayout("candidate-profile")]);

  if (!candidate) {
    notFound();
  }

  return (
    <CandidateProfileWorkspace
      candidate={candidate}
      canEdit={access.role === "ADMIN"}
      savedLayout={layout.layout}
      savedWidgets={layout.widgets}
    />
  );
}