import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { isAuthRequired } from "@/lib/auth/auth-config";
import { isRoleName, type RoleName } from "@/lib/auth/roles";
import { getWorkspaceModuleAccessPolicy } from "@/lib/data/module-access";
import { getWorkspaceBranding, resolveBrandingLogo } from "@/lib/data/branding";
import { EnvironmentBanner } from "@/components/layout/EnvironmentBanner";
import { ModuleAccessShell } from "@/components/layout/ModuleAccessShell";
import { Sidebar } from "@/components/layout/Sidebar";
import { FeedbackButton } from "@/components/feedback/FeedbackButton";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const authRequired = isAuthRequired();
  const session = authRequired ? await getServerSession(authOptions) : null;
  const role: RoleName | null = authRequired ? (isRoleName(session?.user?.role) ? session.user.role : null) : "ADMIN";
  const policy = await getWorkspaceModuleAccessPolicy();
  const branding = await getWorkspaceBranding();
  const sidebarLogo = resolveBrandingLogo(branding, "sidebar");
  const showSidebar = Boolean(role);

  return (
    <div className="min-h-screen bg-brand-cloudDancer text-brand-black">
      <div className="flex min-h-screen">
        {showSidebar && role ? <Sidebar role={role} policy={policy} logoDataUrl={sidebarLogo} /> : null}
        <main className="min-w-0 flex-1">
          {/* Spacer so the fixed mobile menu button doesn't overlap content */}
          {showSidebar ? <div className="h-12 lg:hidden" /> : null}
          <EnvironmentBanner />
          <ModuleAccessShell role={role} policy={policy}>
            {children}
          </ModuleAccessShell>
        </main>
      </div>
      {showSidebar ? <FeedbackButton /> : null}
    </div>
  );
}
