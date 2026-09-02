import { notFound } from "next/navigation";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { hasPermission } from "@/lib/auth/roles";
import { getNewHireDetail } from "@/lib/data/onboarding";
import { getChecklistSections } from "@/lib/data/onboarding-grid-config";
import { getTaskEmailMap } from "@/lib/onboarding/task-email-config";
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
  const hire = await getNewHireDetail(id);
  if (!hire) {
    notFound();
  }
  const [travelTrips, travelLoyalty, journey, onboardingArchives, cardOrders, sections, taskEmails] = await Promise.all([
    getTravelTripsForNewHire(id),
    getNewHireLoyalty(id),
    getEmployeeJourney(id),
    getOnboardingArchives(id),
    getCardOrdersForHire(id),
    getChecklistSections(),
    getTaskEmailMap()
  ]);

  return (
    <NewHireDetailWorkspace
      hire={hire}
      travelTrips={travelTrips}
      travelLoyalty={travelLoyalty}
      journey={journey}
      onboardingArchives={onboardingArchives}
      cardOrders={cardOrders}
      roleTitleOptions={ROLE_TITLE_OPTIONS}
      sections={sections}
      emailTaskKeys={Object.keys(taskEmails)}
      canEdit={hasPermission(access.role, "candidates:write")}
    />
  );
}
