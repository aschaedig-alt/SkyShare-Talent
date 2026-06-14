import { CalendarWorkspace } from "@/components/calendar/CalendarWorkspace";
import { getCalendarData } from "@/lib/data/calendar";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getPageLayout } from "@/lib/data/page-layout";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const access = await requireModulePageAccess("calendar");
  const [data, saved] = await Promise.all([getCalendarData(), getPageLayout("calendar")]);

  return (
    <CalendarWorkspace
      data={data}
      canEdit={access.role === "ADMIN"}
      savedLayout={saved.layout}
      savedWidgets={saved.widgets}
    />
  );
}
