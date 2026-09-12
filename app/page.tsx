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
  // In parallel: getWorkspaceModuleAccessPolicy takes no arguments and reads
  // nothing from the session. This route renders nothing but a redirect and is
  // the first thing every user hits, so those round trips are the whole cost of
  // it — resolveUserHome below genuinely needs both and stays where it is.
  const [session, policy] = await Promise.all([getServerSession(authOptions), getWorkspaceModuleAccessPolicy()]);
  const role: RoleName = isRoleName(session?.user?.role) ? session.user.role : "VIEWER";
  redirect(await resolveUserHome(session?.user?.id, policy, role));
}
