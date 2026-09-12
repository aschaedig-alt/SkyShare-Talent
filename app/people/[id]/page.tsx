import { notFound } from "next/navigation";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { hasPermission } from "@/lib/auth/roles";
import { getNewHireDetail } from "@/lib/data/onboarding";
import { buildChecklistRows, getChecklistSections } from "@/lib/data/onboarding-grid-config";
import { getTaskEmailMap } from "@/lib/onboarding/task-email-config";
import { getHireSendStatus } from "@/lib/front/send-status";
import { getTravelTripsForNewHire, getNewHireLoyalty } from "@/lib/data/travel";
import { getEmployeeJourney } from "@/lib/data/employee-journey";
import { getOnboardingArchives } from "@/lib/data/onboarding-rounds";
import { getCardOrdersForHire } from "@/lib/data/business-cards";
import { FLEET_POSITIONS } from "@/lib/fleet/positions";
import { NewHireDetailWorkspace } from "@/components/people/NewHireDetailWorkspace";

export const dynamic = "force-dynamic";

// Role titles offered in the "record role change" picker (registry order).
const ROLE_TITLE_OPTIONS = FLEET_POSITIONS.map((p) => p.title);

export default async function NewHirePage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireModulePageAccess("people");
  const { id } = await params;
  // The detail fetch joins the group rather than gating it: every one of the
  // others takes either id (available above) or no arguments, and none reads
  // hire. The trade: a request for an id that does not exist now pays for the
  // id-scoped reads before it 404s. They all come back empty, and a 404 here is
  // rare — this page is reached from a list of hires that exist.
  const [hire, travelTrips, travelLoyalty, journey, onboardingArchives, cardOrders, sections, checklistRows, taskEmails, sendStatus] = await Promise.all([
    getNewHireDetail(id),
    getTravelTripsForNewHire(id),
    getNewHireLoyalty(id),
    getEmployeeJourney(id),
    getOnboardingArchives(id),
    getCardOrdersForHire(id),
    getChecklistSections(),
    buildChecklistRows(),
    getTaskEmailMap(),
    getHireSendStatus(id)
  ]);
  if (!hire) {
    notFound();
  }

  return (
    <NewHireDetailWorkspace
      hire={hire}
      travelTrips={travelTrips}
      travelLoyalty={travelLoyalty}
      journey={journey}
      onboardingArchives={onboardingArchives}
      cardOrders={cardOrders}
      roleTitleOptions={ROLE_TITLE_OPTIONS}
      sendStatus={sendStatus}
      sections={sections}
      checklistRows={checklistRows}
      emailTaskKeys={Object.keys(taskEmails)}
      canEdit={hasPermission(access.role, "candidates:write")}
    />
  );
}
