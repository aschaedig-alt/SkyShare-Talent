"use client";

import { usePathname } from "next/navigation";
import type { RoleName } from "@/lib/auth/roles";
import { getModuleAccessForPath, type ModuleAccessPolicy } from "@/lib/navigation/modules";

type ModuleAccessShellProps = {
  role: RoleName | null;
  policy: ModuleAccessPolicy;
  children: React.ReactNode;
};

export function ModuleAccessShell({ role, policy, children }: ModuleAccessShellProps) {
  const pathname = usePathname();

  if (!role) {
    return <>{children}</>;
  }

  const access = getModuleAccessForPath(pathname, policy, role);

  if (!access) {
    return <>{children}</>;
  }

  return (
    <div data-module-access={access.rule.accessLevel} data-module-id={access.moduleId}>
      {access.rule.accessLevel === "VIEW_ONLY" ? (
        <>
          {/* MVP-only suppression: obvious controls are muted with CSS here. Tight server-side mutation guards can be added route-by-route later. */}
          <div className="mx-5 mt-4 rounded border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 px-4 py-3 text-sm text-amber-900 dark:text-amber-300 lg:mx-8">
            <div className="font-semibold">View-only access</div>
            <p className="mt-1 text-xs leading-5">
              This module is open for review, but edit and save controls are intentionally muted in this MVP.
            </p>
          </div>
        </>
      ) : null}
      {children}
    </div>
  );
}
