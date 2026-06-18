import { CalendarWorkspace } from "@/components/calendar/CalendarWorkspace";
import { getCalendarData } from "@/lib/data/calendar";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getPageLayout } from "@/lib/data/page-layout";
import { getDocumentCurrency } from "@/lib/data/document-currency";
import { getDepartmentColors } from "@/lib/calendar/department-colors.server";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const access = await requireModulePageAccess("calendar");
  const [data, saved, documentCurrency, departmentColors] = await Promise.all([
    getCalendarData(),
    getPageLayout("calendar"),
    getDocumentCurrency(),
    getDepartmentColors()
  ]);

  return (
    <CalendarWorkspace
      data={data}
      canEdit={access.role === "ADMIN"}
      departmentColors={departmentColors}
      savedLayout={saved.layout}
      savedWidgets={saved.widgets}
      widgetData={{ documentCurrency }}
    />
  );
}
