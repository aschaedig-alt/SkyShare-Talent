import { CandidateProfileWorkspace } from "@/components/candidates/CandidateProfileWorkspace";
import { getCandidateProfileData } from "@/lib/data/candidates";
import { getTravelTripsForCandidate, getCandidateLoyalty, getChecklistRollupForTrips } from "@/lib/data/travel";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getPageLayout } from "@/lib/data/page-layout";
import { getTeamMembers, getInterviewers } from "@/lib/data/team";
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
  // TWO lists on purpose. team feeds @-mentions and must stay Users only, so a
  // mention always reaches somebody who can open the app. interviewers also
  // includes booking hosts, because hiring managers run interviews long before
  // they ever sign in. See lib/data/team.ts.
  const [travelTrips, travelLoyalty, team, interviewers] = await Promise.all([
    getTravelTripsForCandidate(id),
    getCandidateLoyalty(id),
    getTeamMembers(),
    getInterviewers()
  ]);
  // Whoever is signed in is pre-selected as the interviewer — the common case
  // is recording your own interview, and it also makes "my recent interviews"
  // work without anyone having to remember to set it.
  const me = access.email ? interviewers.find((t) => t.email === access.email.toLowerCase()) ?? null : null;

  // Checklists tab. Loaded after the trips because it needs them; skipped
  // entirely when there is no travel, so a candidate who has never flown out
  // does not pay for a WorkspaceSetting read.
  const travelRollup = travelTrips.length
    ? await getChecklistRollupForTrips(travelTrips, candidate.displayName, `/candidates/${id}`)
    : undefined;

  return (
    <CandidateProfileWorkspace
      candidate={candidate}
      team={team}
      interviewers={interviewers}
      me={me}
      // Recruiters run onboarding, not just admins — the Move-to-onboarding,
      // Link-to-a-job, and offer controls all POST candidates:write, which the
      // RECRUITER role already has. (Set a coordinator's account to RECRUITER.)
      canEdit={isAdminOrRecruiter(access.role)}
      // Creating a job from the link modal needs jobs:write — ADMIN + RECRUITER.
      canCreateJob={hasPermission(access.role, "jobs:write")}
      // Test-data deletion is admin-only and further gated on the TEST tag.
      canDelete={access.role === "ADMIN"}
      // The narrow write path for a hiring manager scoped to specific candidates.
      // Reaching this line already means the allowlist let them open the profile
      // (getCandidateProfileData returns null otherwise), so the only remaining
      // question is whether an admin granted them the annotate right.
      canAnnotate={Boolean(viewer.allowlistCanAnnotate)}
      savedLayout={layout.layout}
      savedWidgets={layout.widgets}
      travelTrips={travelTrips}
      travelRollup={travelRollup}
      travelLoyalty={travelLoyalty}
    />
  );
}