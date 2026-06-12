import { requireModulePageAccess } from "@/lib/data/module-access";
import {
  getOnboardingCounts,
  getActiveDashboard,
  getActiveGridHires,
  getActiveMilestoneData,
  getPostOnboardHires,
  getArchivedRows
} from "@/lib/data/onboarding";
import { PreOnboardingWorkspace, type PeopleTab } from "@/components/people/PreOnboardingWorkspace";

export const dynamic = "force-dynamic";

const TABS: PeopleTab[] = ["dashboard", "grid", "milestones", "post", "archived"];

function tabFromParam(value: string | undefined): PeopleTab {
  return TABS.includes(value as PeopleTab) ? (value as PeopleTab) : "dashboard";
}

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireModulePageAccess("people");
  const sp = await searchParams;
  const tab = tabFromParam(sp.tab);
  const counts = await getOnboardingCounts();

  if (tab === "dashboard") {
    return <PreOnboardingWorkspace tab={tab} counts={counts} dashboard={await getActiveDashboard()} />;
  }
  if (tab === "grid") {
    return <PreOnboardingWorkspace tab={tab} counts={counts} grid={await getActiveGridHires()} />;
  }
  if (tab === "milestones") {
    return <PreOnboardingWorkspace tab={tab} counts={counts} milestones={await getActiveMilestoneData()} />;
  }
  if (tab === "post") {
    return <PreOnboardingWorkspace tab={tab} counts={counts} post={await getPostOnboardHires()} />;
  }
  return <PreOnboardingWorkspace tab={tab} counts={counts} archived={await getArchivedRows()} />;
}
