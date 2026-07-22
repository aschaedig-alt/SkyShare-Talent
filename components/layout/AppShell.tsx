import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { isAuthRequired } from "@/lib/auth/auth-config";
import { isRoleName, type RoleName } from "@/lib/auth/roles";
import { getWorkspaceModuleAccessPolicy } from "@/lib/data/module-access";
import { resolveUserHome } from "@/lib/data/user-home";
import { getWorkspaceBranding, resolveBrandingLogo } from "@/lib/data/branding";
import { EnvironmentBanner } from "@/components/layout/EnvironmentBanner";
import { ModuleAccessShell } from "@/components/layout/ModuleAccessShell";
import { Sidebar } from "@/components/layout/Sidebar";
// Feedback now lives in the sidebar rail (see Sidebar) rather than floating over
// the page — a floating trigger could be dragged off-screen and sat behind modals.

export async function AppShell({ children }: { children: React.ReactNode }) {
  // Public booking pages and shared read-only reports render bare — no sidebar,
  // banner, or feedback button.
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (pathname.startsWith("/book") || pathname.startsWith("/r/") || pathname.startsWith("/welcome")) {
    return (
      <div className="min-h-screen bg-[var(--skyshare-page)] text-brand-black dark:text-slate-100">{children}</div>
    );
  }

  const authRequired = isAuthRequired();
  const session = authRequired ? await getServerSession(authOptions) : null;
  const role: RoleName | null = authRequired ? (isRoleName(session?.user?.role) ? session.user.role : null) : "ADMIN";
  const policy = await getWorkspaceModuleAccessPolicy();
  const branding = await getWorkspaceBranding();
  const sidebarLogo = resolveBrandingLogo(branding, "sidebar");
  const showSidebar = Boolean(role);
  const homeHref = role ? await resolveUserHome(session?.user?.id, policy, role) : "/command-center";

  return (
    <div className="min-h-screen bg-[var(--skyshare-page)] text-brand-black dark:text-slate-100">
      <div className="flex min-h-screen">
        {showSidebar && role ? (
          <Sidebar role={role} policy={policy} logoDataUrl={sidebarLogo} userEmail={session?.user?.email ?? null} homeHref={homeHref} />
        ) : null}
        <main className="min-w-0 flex-1">
          {/* Spacer so the fixed mobile menu button doesn't overlap content */}
          {showSidebar ? <div className="h-12 lg:hidden" /> : null}
          <EnvironmentBanner />
          <ModuleAccessShell role={role} policy={policy}>
            {children}
          </ModuleAccessShell>
        </main>
      </div>
    </div>
  );
}
