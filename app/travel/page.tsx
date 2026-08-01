import { requireModulePageAccess } from "@/lib/data/module-access";
import { getTravelCalendarData, getTravelOverview } from "@/lib/data/travel";
import { TravelHubWorkspace } from "@/components/travel/TravelHubWorkspace";

export const dynamic = "force-dynamic";

export default async function TravelPage() {
  await requireModulePageAccess("people");
  const [data, calendar] = await Promise.all([getTravelOverview(), getTravelCalendarData()]);
  return <TravelHubWorkspace data={data} calendar={calendar} />;
}
