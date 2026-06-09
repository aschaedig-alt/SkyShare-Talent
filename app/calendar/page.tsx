import { CalendarWorkspace } from "@/components/calendar/CalendarWorkspace";
import { getCalendarData } from "@/lib/data/calendar";
import { requireModulePageAccess } from "@/lib/data/module-access";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  await requireModulePageAccess("calendar");
  const data = await getCalendarData();

  return <CalendarWorkspace data={data} />;
}
