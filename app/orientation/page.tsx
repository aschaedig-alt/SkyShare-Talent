import { requireModulePageAccess } from "@/lib/data/module-access";
import { getOrientationSessions, getOrientationCohorts, getUnscheduledHires } from "@/lib/data/orientation";
import { getUsedOrientationPlaces } from "@/lib/orientation/places-used";
import { OrientationOverview } from "@/components/orientation/OrientationOverview";

export const dynamic = "force-dynamic";

export default async function OrientationPage() {
  await requireModulePageAccess("people");
  const [sessions, cohortData, unscheduled, usedPlaces] = await Promise.all([
    getOrientationSessions(),
    getOrientationCohorts(),
    getUnscheduledHires(),
    getUsedOrientationPlaces()
  ]);
  return (
    <OrientationOverview
      upcoming={sessions.upcoming}
      past={sessions.past}
      cohorts={cohortData.cohorts}
      calendar={cohortData.calendar}
      unscheduled={unscheduled}
      usedPlaces={usedPlaces}
    />
  );
}
