import type { ApiRouteUser } from "@/lib/auth/route-auth";
import { getWorkspaceModuleAccessPolicy } from "@/lib/data/module-access";
import { getModuleAccessRule, type ModuleId } from "@/lib/navigation/modules";

// Reads the live per-role Module Visibility & Access policy (set in
// Settings) to decide whether a write should go through. ADMIN/RECRUITER are
// never narrowed by it — they keep the full static permission they've always
// had. Everyone else (in practice HIRING_MANAGER) is gated by the resolved
// AccessLevel for this module: HIDDEN/VIEW_ONLY block both; EDIT allows
// normal edits but not delete/merge/bulk-delete; FULL_ACCESS allows both.
//
// Wired in today only for the Candidates and Employees ("people") modules —
// see the callers. Other modules still rely solely on the static role table
// in lib/auth/roles.ts.
export async function canWriteModule(
  user: ApiRouteUser,
  moduleId: ModuleId,
  action: "edit" | "delete"
): Promise<boolean> {
  if (user.role === "ADMIN" || user.role === "RECRUITER") {
    return true;
  }

  const policy = await getWorkspaceModuleAccessPolicy();
  const rule = getModuleAccessRule(policy, moduleId, user.role);

  if (rule.accessLevel === "FULL_ACCESS") return true;
  if (rule.accessLevel === "EDIT") return action === "edit";
  return false;
}
