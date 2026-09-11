import { requireModulePageAccess } from "@/lib/data/module-access";
import {
  getTravelCalendarData,
  getTravelChecklistRollup,
  getTravelOverview,
  getTravelSpendByMonth
} from "@/lib/data/travel";
import { TravelHubWorkspace } from "@/components/travel/TravelHubWorkspace";

export const dynamic = "force-dynamic";

export default async function TravelPage() {
  await requireModulePageAccess("people");
  const [data, calendar, rollup, spend] = await Promise.all([
    getTravelOverview(),
    getTravelCalendarData(),
    getTravelChecklistRollup(),
    getTravelSpendByMonth()
  ]);
  return <TravelHubWorkspace data={data} calendar={calendar} rollup={rollup} spend={spend} />;
}
