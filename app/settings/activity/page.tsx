import { ActivityDashboardWorkspace } from "@/components/settings/ActivityDashboardWorkspace";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getTeamActivitySummary } from "@/lib/activity/logger";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  try {
    await requireModulePageAccess("settings");

    const activityData = await getTeamActivitySummary(30);

    // Serialize dates for client component
    const serializedData = {
      ...activityData,
      recentActivities: activityData.recentActivities.map((activity) => ({
        ...activity,
        createdAt: activity.createdAt.toISOString(),
      })),
    };

    return (
      <div className="space-y-4 px-5 py-5 lg:px-8">
        <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Admin foundation</p>
          <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Activity</h1>
        </section>

        <ActivityDashboardWorkspace activityData={serializedData} />
      </div>
    );
  } catch (error) {
    console.error("Error loading activity page:", error);
    return (
      <div className="space-y-4 px-5 py-5 lg:px-8">
        <section className="rounded border border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15 p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-red-600 dark:text-red-400">Error</p>
          <h1 className="text-2xl font-semibold text-red-700 dark:text-red-300">Failed to load activity dashboard</h1>
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error instanceof Error ? error.message : "Unknown error"}</p>
        </section>
      </div>
    );
  }
}
