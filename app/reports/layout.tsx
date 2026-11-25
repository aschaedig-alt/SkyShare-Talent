import { ReportsLibrary } from "@/components/reports/ReportsLibrary";
import { R } from "@/components/reports/report-ui";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { DEFAULT_TIMEZONE } from "@/lib/calendar/timezones";

export const dynamic = "force-dynamic";

// Every Reports page sits in the Library: the side list of reports, At a glance
// first (his pick, 2026-11-24). The HR-only reports are listed for admins alone -
// their pages check again, since a URL can be typed.
export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  const { role } = await requireModulePageAccess("reports");
  const asOf = new Intl.DateTimeFormat("en-US", { timeZone: DEFAULT_TIMEZONE, month: "short", day: "numeric", year: "numeric" }).format(new Date());
  return (
    <div className={R.page}>
      <ReportsLibrary isHr={role === "ADMIN"} canShare={role === "ADMIN"} asOf={asOf}>
        {children}
      </ReportsLibrary>
    </div>
  );
}
