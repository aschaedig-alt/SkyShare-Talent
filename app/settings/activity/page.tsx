import { ActivityDashboardWorkspace } from "@/components/settings/ActivityDashboardWorkspace";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getTeamActivitySummary } from "@/lib/activity/logger";

export default async function ActivityPage() {
  await requireModulePageAccess("settings");

  const activityData = await getTeamActivitySummary(30);

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Admin foundation</p>
        <h1 className="text-2xl font-semibold text-brand-lea">Settings</h1>
      </section>

      <SettingsTabs currentTab="activity" />

      <ActivityDashboardWorkspace activityData={activityData} />
    </div>
  );
}
