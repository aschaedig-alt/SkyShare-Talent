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
import { isAdminOrRecruiter } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

const TABS: PeopleTab[] = ["dashboard", "grid", "post", "archived"];

function tabFromParam(value: string | undefined): PeopleTab {
  // Grid + Milestones merged into one tab; keep old ?tab=milestones links working.
  if (value === "milestones") return "grid";
  return TABS.includes(value as PeopleTab) ? (value as PeopleTab) : "dashboard";
}

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  // The two direct create paths (+ Add new hire / Import) both make a hire with
  // NO candidate link — the wrong door for a live pipeline hire — so they are
  // kept off the page for view-only roles. Recruiters (who run onboarding and
  // roster imports) get them alongside admins; everything here POSTs
  // candidates:write, which the RECRUITER role already has.
  const access = await requireModulePageAccess("people");
  const canManage = isAdminOrRecruiter(access.role);
  const sp = await searchParams;
  const tab = tabFromParam(sp.tab);
  const counts = await getOnboardingCounts();

  if (tab === "dashboard") {
    return <PreOnboardingWorkspace tab={tab} counts={counts} canManage={canManage} dashboard={await getActiveDashboard()} />;
  }
  if (tab === "grid") {
    const [grid, milestones] = await Promise.all([getActiveGridHires(), getActiveMilestoneData()]);
    return <PreOnboardingWorkspace tab={tab} counts={counts} canManage={canManage} grid={grid} milestones={milestones} />;
  }
  if (tab === "post") {
    return <PreOnboardingWorkspace tab={tab} counts={counts} canManage={canManage} post={await getPostOnboardHires()} />;
  }
  return <PreOnboardingWorkspace tab={tab} counts={counts} canManage={canManage} archived={await getArchivedRows()} />;
}
