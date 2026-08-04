import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { RoleName } from "@/lib/auth/roles";
import { authOptions } from "@/auth";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import {
  createDefaultModuleAccessPolicy,
  normalizeModuleAccessPolicy,
  type ModuleAccessPolicy,
  type ModuleId,
  getModuleAccessRule
} from "@/lib/navigation/modules";
import { isAuthRequired } from "@/lib/auth/auth-config";
import { isRoleName } from "@/lib/auth/roles";
import { isEmailBlocked } from "@/lib/auth/blocklist";

const workspaceSettingKey = "module-access";
const workspaceSettingScope = "workspace";

function coerceRole(sessionRole: string | null | undefined): RoleName | null {
  return isRoleName(sessionRole) ? sessionRole : null;
}

// Wrapped in React's cache() because this single row is read at least TWICE on
// every page: once by AppShell (which the root layout renders on every route)
// and again by each page's own requireModulePageAccess(). cache() is per-request
// and per-argument, so the second and later calls in a request reuse the first
// one's promise instead of making another Neon round trip. Every caller is
// server-side (server components, route handlers, server-only lib modules) —
// verified before wrapping. Outside a React request scope (an ad-hoc tsx script)
// cache() degrades to a plain call, so scripts still work, just uncached.
//
// The corollary: a save inside the same request will NOT be visible to a later
// read in that same request. No caller does that today — the settings POST route
// returns the normalized policy it just saved rather than re-reading it.
export const getWorkspaceModuleAccessPolicy = cache(async (): Promise<ModuleAccessPolicy> => {
  const setting = await prisma.workspaceSetting.findFirst({
    where: {
      scope: workspaceSettingScope,
      key: workspaceSettingKey
    },
    select: {
      valueJson: true
    }
  });

  if (!setting?.valueJson) {
    return createDefaultModuleAccessPolicy();
  }

  try {
    return normalizeModuleAccessPolicy(JSON.parse(setting.valueJson) as unknown);
  } catch {
    return createDefaultModuleAccessPolicy();
  }
});

export async function saveWorkspaceModuleAccessPolicy(policy: ModuleAccessPolicy) {
  const normalized = normalizeModuleAccessPolicy(policy);

  await prisma.workspaceSetting.upsert({
    where: {
      scope_key: {
        scope: workspaceSettingScope,
        key: workspaceSettingKey
      }
    },
    create: {
      scope: workspaceSettingScope,
      key: workspaceSettingKey,
      valueJson: JSON.stringify({
        version: 1,
        policy: normalized
      })
    },
    update: {
      valueJson: JSON.stringify({
        version: 1,
        policy: normalized
      })
    }
  });

  return normalized;
}

export async function requireModulePageAccess(moduleId: ModuleId) {
  const authRequired = isAuthRequired();
  const session = authRequired ? await getServerSession(authOptions) : null;
  const role = authRequired ? coerceRole(session?.user?.role) : "ADMIN";

  if (authRequired && !role) {
    redirect("/login?reason=session-required");
  }

  // A revoked account may still hold a valid JWT until it expires; catch it here,
  // on the next page it loads, and send it back to the login screen.
  if (authRequired && (await isEmailBlocked(session?.user?.email))) {
    redirect("/login?reason=access-revoked");
  }

  const policy = await getWorkspaceModuleAccessPolicy();
  const rule = getModuleAccessRule(policy, moduleId, role ?? "ADMIN");

  if (rule.accessLevel === "HIDDEN") {
    // MVP guard: this blocks direct route access at the page boundary.
    // A centralized route-middleware layer can replace these per-page checks later.
    notFound();
  }

  return {
    policy,
    role: role ?? "ADMIN",
    rule,
    // Who is signed in, so a page can pre-select them (e.g. as the interviewer
    // on a write-up). Null when auth is bypassed in local dev, which callers
    // must treat as "nobody in particular" rather than assuming a user.
    email: session?.user?.email ?? null,
    userId: session?.user?.id ?? null
  };
}
