import { ActivityDashboardWorkspace } from "@/components/settings/ActivityDashboardWorkspace";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getTeamActivitySummary } from "@/lib/activity/logger";

export default async function ActivityPage() {
  await requireModulePageAccess("settings");

  const activityData = await getTeamActivitySummary(30);

  return <ActivityDashboardWorkspace activityData={activityData} />;
}
