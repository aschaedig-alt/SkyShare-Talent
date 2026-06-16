import { requireModulePageAccess } from "@/lib/data/module-access";
import { getOrientationSessions, getOrientationCohorts, getUnscheduledHires } from "@/lib/data/orientation";
import { OrientationOverview } from "@/components/orientation/OrientationOverview";

export const dynamic = "force-dynamic";

export default async function OrientationPage() {
  await requireModulePageAccess("people");
  const [sessions, cohortData, unscheduled] = await Promise.all([
    getOrientationSessions(),
    getOrientationCohorts(),
    getUnscheduledHires()
  ]);
  return (
    <OrientationOverview
      upcoming={sessions.upcoming}
      past={sessions.past}
      cohorts={cohortData.cohorts}
      calendar={cohortData.calendar}
      unscheduled={unscheduled}
    />
  );
}
