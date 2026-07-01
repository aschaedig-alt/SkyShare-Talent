import { notFound } from "next/navigation";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getNewHireDetail } from "@/lib/data/onboarding";
import { getTravelTripsForNewHire, getNewHireLoyalty } from "@/lib/data/travel";
import { getEmployeeJourney } from "@/lib/data/employee-journey";
import { FLEET_POSITIONS } from "@/lib/fleet/positions";
import { NewHireDetailWorkspace } from "@/components/people/NewHireDetailWorkspace";

export const dynamic = "force-dynamic";

// Role titles offered in the "record role change" picker (registry order).
const ROLE_TITLE_OPTIONS = FLEET_POSITIONS.map((p) => p.title);

export default async function NewHirePage({ params }: { params: Promise<{ id: string }> }) {
  await requireModulePageAccess("people");
  const { id } = await params;
  const hire = await getNewHireDetail(id);
  if (!hire) {
    notFound();
  }
  const [travelTrips, travelLoyalty, journey] = await Promise.all([
    getTravelTripsForNewHire(id),
    getNewHireLoyalty(id),
    getEmployeeJourney(id)
  ]);

  return (
    <NewHireDetailWorkspace
      hire={hire}
      travelTrips={travelTrips}
      travelLoyalty={travelLoyalty}
      journey={journey}
      roleTitleOptions={ROLE_TITLE_OPTIONS}
    />
  );
}
