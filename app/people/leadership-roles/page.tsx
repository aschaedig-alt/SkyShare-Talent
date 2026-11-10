import { requireModulePageAccess } from "@/lib/data/module-access";
import { hasPermission } from "@/lib/auth/roles";
import { listLeadershipRoles } from "@/lib/people/leadership-roles";
import { LeadershipRolesWorkspace } from "@/components/people/LeadershipRolesWorkspace";

export const dynamic = "force-dynamic";

// Who holds each leadership role that supervisors can be set BY ROLE — Chief
// Pilot, Assistant Chief Pilot. Changing a holder here re-points every pilot
// who reports to that role. See lib/people/leadership-roles.ts.
export default async function LeadershipRolesPage() {
  const access = await requireModulePageAccess("people");
  const roles = await listLeadershipRoles();
  return <LeadershipRolesWorkspace initialRoles={roles} canEdit={hasPermission(access.role, "candidates:write")} />;
}
