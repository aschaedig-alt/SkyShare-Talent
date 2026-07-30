import { CandidateProfileWorkspace } from "@/components/candidates/CandidateProfileWorkspace";
import { getCandidateProfileData } from "@/lib/data/candidates";
import { getTravelTripsForCandidate, getCandidateLoyalty } from "@/lib/data/travel";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getPageLayout } from "@/lib/data/page-layout";
import { getTeamMembers } from "@/lib/data/team";
import { isAdminOrRecruiter, hasPermission } from "@/lib/auth/roles";
import { resolveViewerScope } from "@/lib/auth/viewer-scope";
import { notFound } from "next/navigation";

type CandidateDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CandidateDetailPage({ params }: CandidateDetailPageProps) {
  const access = await requireModulePageAccess("candidates");
  const { id } = await params;
  const viewer = await resolveViewerScope(access.role, access.userId, access.email);
  const [candidate, layout] = await Promise.all([getCandidateProfileData(id, viewer), getPageLayout("candidate-profile")]);

  if (!candidate) {
    notFound();
  }
  const [travelTrips, travelLoyalty, team] = await Promise.all([
    getTravelTripsForCandidate(id),
    getCandidateLoyalty(id),
    getTeamMembers()
  ]);
  // Whoever is signed in is pre-selected as the interviewer — the common case
  // is recording your own interview, and it also makes "my recent interviews"
  // work without anyone having to remember to set it.
  const me = access.email ? team.find((t) => t.email === access.email.toLowerCase()) ?? null : null;

  return (
    <CandidateProfileWorkspace
      candidate={candidate}
      team={team}
      me={me}
      // Recruiters run onboarding, not just admins — the Move-to-onboarding,
      // Link-to-a-job, and offer controls all POST candidates:write, which the
      // RECRUITER role already has. (Set a coordinator's account to RECRUITER.)
      canEdit={isAdminOrRecruiter(access.role)}
      // Creating a job from the link modal needs jobs:write — ADMIN + RECRUITER.
      canCreateJob={hasPermission(access.role, "jobs:write")}
      // Test-data deletion is admin-only and further gated on the TEST tag.
      canDelete={access.role === "ADMIN"}
      savedLayout={layout.layout}
      savedWidgets={layout.widgets}
      travelTrips={travelTrips}
      travelLoyalty={travelLoyalty}
    />
  );
}