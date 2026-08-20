import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { isAuthRequired } from "@/lib/auth/auth-config";
import { isRoleName, type RoleName } from "@/lib/auth/roles";
import { getWorkspaceModuleAccessPolicy } from "@/lib/data/module-access";
import { resolveUserHome } from "@/lib/data/user-home";
import { resolveViewerScope } from "@/lib/auth/viewer-scope";
import { getWorkspaceBranding, resolveBrandingLogo } from "@/lib/data/branding";
import { EnvironmentBanner } from "@/components/layout/EnvironmentBanner";
import { ModuleAccessShell } from "@/components/layout/ModuleAccessShell";
import { Sidebar } from "@/components/layout/Sidebar";
import { SopBookmark } from "@/components/handbook/SopBookmark";
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

  // The root layout renders AppShell on EVERY route, so anything sequential here
  // is a tax on every page load. The session (JWT cookie) and the two settings
  // rows (Neon) depend on nothing, so they run concurrently instead of as three
  // back-to-back round trips.
  const [session, policy, branding] = await Promise.all([
    authRequired ? getServerSession(authOptions) : Promise.resolve(null),
    getWorkspaceModuleAccessPolicy(),
    getWorkspaceBranding()
  ]);

  const role: RoleName | null = authRequired ? (isRoleName(session?.user?.role) ? session.user.role : null) : "ADMIN";
  const sidebarLogo = resolveBrandingLogo(branding, "sidebar");
  const showSidebar = Boolean(role);

  // Per-user module visibility. resolveViewerScope is React-cached, so the page s
  // own requireModulePageAccess call reuses this exact promise rather than making
  // a second round trip - and it short-circuits without a query at all for
  // ADMIN/RECRUITER, who are never narrowed.
  const viewer = role
    ? await resolveViewerScope(role, session?.user?.id ?? null, session?.user?.email ?? null)
    : null;
  const moduleOverrides = viewer?.moduleOverrides ?? null;
  // This one genuinely depends on both the session and the policy above, so it
  // stays sequential — it cannot start until they have landed.
  const homeHref = role ? await resolveUserHome(session?.user?.id, policy, role, moduleOverrides) : "/command-center";

  return (
    <div className="min-h-screen bg-[var(--skyshare-page)] text-brand-black dark:text-slate-100">
      <div className="flex min-h-screen">
        {showSidebar && role ? (
          <Sidebar
            role={role}
            policy={policy}
            moduleOverrides={moduleOverrides}
            logoDataUrl={sidebarLogo}
            userEmail={session?.user?.email ?? null}
            homeHref={homeHref}
          />
        ) : null}
        <main className="min-w-0 flex-1">
          {/* Spacer so the fixed mobile menu button doesn't overlap content */}
          {showSidebar ? <div className="h-12 lg:hidden" /> : null}
          <EnvironmentBanner />
          <ModuleAccessShell role={role} policy={policy} moduleOverrides={moduleOverrides}>
            {children}
          </ModuleAccessShell>
          {/* Route-aware SOP bookmark — appears only on pages that have an SOP. */}
          <SopBookmark />
        </main>
      </div>
    </div>
  );
}
