import { requireModulePageAccess } from "@/lib/data/module-access";
import { getTravelCalendarData, getTravelChecklistRollup, getTravelOverview } from "@/lib/data/travel";
import { TravelHubWorkspace } from "@/components/travel/TravelHubWorkspace";

export const dynamic = "force-dynamic";

export default async function TravelPage() {
  await requireModulePageAccess("people");
  const [data, calendar, rollup] = await Promise.all([getTravelOverview(), getTravelCalendarData(), getTravelChecklistRollup()]);
  return <TravelHubWorkspace data={data} calendar={calendar} rollup={rollup} />;
}
