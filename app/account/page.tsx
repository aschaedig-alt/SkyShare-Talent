import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { isAuthRequired } from "@/lib/auth/auth-config";
import { isRoleName, type RoleName } from "@/lib/auth/roles";
import { getWorkspaceModuleAccessPolicy } from "@/lib/data/module-access";
import { getUserHome, visibleHomeChoices, DEFAULT_HOME } from "@/lib/data/user-home";
import { AccountPreferences } from "@/components/account/AccountPreferences";

// A per-user preferences page any signed-in role can reach (unlike /settings, which
// is admin-only and team-wide).
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const authRequired = isAuthRequired();
  const session = authRequired ? await getServerSession(authOptions) : null;
  if (authRequired && !session?.user) {
    redirect("/login");
  }

  const role: RoleName = isRoleName(session?.user?.role) ? session.user.role : "ADMIN";
  const policy = await getWorkspaceModuleAccessPolicy();
  const choices = visibleHomeChoices(policy, role);
  const current = (await getUserHome(session?.user?.id)) ?? "";

  return <AccountPreferences email={session?.user?.email ?? null} choices={choices} current={current} defaultHome={DEFAULT_HOME} />;
}
