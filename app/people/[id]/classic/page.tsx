import { notFound } from "next/navigation";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { hasPermission } from "@/lib/auth/roles";
import { getNewHireDetail } from "@/lib/data/onboarding";
import { getChecklistSections } from "@/lib/data/onboarding-grid-config";
import { getTaskEmailMap } from "@/lib/onboarding/task-email-config";
import { getHireSendStatus } from "@/lib/front/send-status";
import { getTravelTripsForNewHire, getNewHireLoyalty } from "@/lib/data/travel";
import { getEmployeeJourney } from "@/lib/data/employee-journey";
import { getOnboardingArchives } from "@/lib/data/onboarding-rounds";
import { FLEET_POSITIONS } from "@/lib/fleet/positions";
import { NewHireDetailWorkspaceClassic } from "@/components/people/NewHireDetailWorkspaceClassic";

export const dynamic = "force-dynamic";

// The PREVIOUS /people/<id> layout, kept reachable while we decide whether
// anything on it is worth carrying into the new one. Deliberately identical to
// ../page.tsx apart from the component it renders — same data, same auth gate,
// same props — so what you are comparing is the arrangement and nothing else.
//
// TEMPORARY. Delete this directory and NewHireDetailWorkspaceClassic.tsx
// together when it has served its purpose; nothing else imports either.
const ROLE_TITLE_OPTIONS = FLEET_POSITIONS.map((p) => p.title);

export default async function NewHireClassicPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireModulePageAccess("people");
  const { id } = await params;
  // Same shape as ../page.tsx: the detail fetch joins the group instead of
  // gating it, because none of the others reads hire — they take id or nothing.
  const [hire, travelTrips, travelLoyalty, journey, onboardingArchives, sections, taskEmails, sendStatus] = await Promise.all([
    getNewHireDetail(id),
    getTravelTripsForNewHire(id),
    getNewHireLoyalty(id),
    getEmployeeJourney(id),
    getOnboardingArchives(id),
    getChecklistSections(),
    getTaskEmailMap(),
    getHireSendStatus(id)
  ]);
  if (!hire) {
    notFound();
  }

  return (
    <NewHireDetailWorkspaceClassic
      hire={hire}
      travelTrips={travelTrips}
      travelLoyalty={travelLoyalty}
      journey={journey}
      onboardingArchives={onboardingArchives}
      roleTitleOptions={ROLE_TITLE_OPTIONS}
      sendStatus={sendStatus}
      sections={sections}
      emailTaskKeys={Object.keys(taskEmails)}
      canEdit={hasPermission(access.role, "candidates:write")}
    />
  );
}
