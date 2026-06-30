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

const TABS: PeopleTab[] = ["dashboard", "grid", "post", "archived"];

function tabFromParam(value: string | undefined): PeopleTab {
  // Grid + Milestones merged into one tab; keep old ?tab=milestones links working.
  if (value === "milestones") return "grid";
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
    const [grid, milestones] = await Promise.all([getActiveGridHires(), getActiveMilestoneData()]);
    return <PreOnboardingWorkspace tab={tab} counts={counts} grid={grid} milestones={milestones} />;
  }
  if (tab === "post") {
    return <PreOnboardingWorkspace tab={tab} counts={counts} post={await getPostOnboardHires()} />;
  }
  return <PreOnboardingWorkspace tab={tab} counts={counts} archived={await getArchivedRows()} />;
}
