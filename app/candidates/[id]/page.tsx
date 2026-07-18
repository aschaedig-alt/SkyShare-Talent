import { CandidateProfileWorkspace } from "@/components/candidates/CandidateProfileWorkspace";
import { getCandidateProfileData } from "@/lib/data/candidates";
import { getTravelTripsForCandidate, getCandidateLoyalty } from "@/lib/data/travel";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getPageLayout } from "@/lib/data/page-layout";
import { isAdminOrRecruiter } from "@/lib/auth/roles";
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
  const [travelTrips, travelLoyalty] = await Promise.all([getTravelTripsForCandidate(id), getCandidateLoyalty(id)]);

  return (
    <CandidateProfileWorkspace
      candidate={candidate}
      // Recruiters run onboarding, not just admins — the Move-to-onboarding,
      // Link-to-a-job, and offer controls all POST candidates:write, which the
      // RECRUITER role already has. (Set a coordinator's account to RECRUITER.)
      canEdit={isAdminOrRecruiter(access.role)}
      // Test-data deletion is admin-only and further gated on the TEST tag.
      canDelete={access.role === "ADMIN"}
      savedLayout={layout.layout}
      savedWidgets={layout.widgets}
      travelTrips={travelTrips}
      travelLoyalty={travelLoyalty}
    />
  );
}