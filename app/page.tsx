import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { isAuthRequired } from "@/lib/auth/auth-config";
import { isRoleName, type RoleName } from "@/lib/auth/roles";
import { getWorkspaceModuleAccessPolicy } from "@/lib/data/module-access";
import { resolveUserHome, DEFAULT_HOME } from "@/lib/data/user-home";

// The landing route. Each user can set their own default home page (My preferences);
// unset, or when auth is bypassed locally, it falls back to the Command Center.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!isAuthRequired()) {
    redirect(DEFAULT_HOME);
  }
  const session = await getServerSession(authOptions);
  const role: RoleName = isRoleName(session?.user?.role) ? session.user.role : "VIEWER";
  const policy = await getWorkspaceModuleAccessPolicy();
  redirect(await resolveUserHome(session?.user?.id, policy, role));
}
