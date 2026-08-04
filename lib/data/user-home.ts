import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getVisibleNavigationGroups, type ModuleAccessPolicy } from "@/lib/navigation/modules";
import type { RoleName } from "@/lib/auth/roles";

// Each user's chosen default landing page. It is PER-USER (keyed by the user id),
// but stored in the shared WorkspaceSetting table so there is no schema migration
// against the live DB — scope "user-pref", key `home:<userId>`, value = the href.
const SCOPE = "user-pref";
const keyFor = (userId: string) => `home:${userId}`;

// The Command Center's home. It moved to /settings/command-center on Aug 3 and
// is now ADMIN-ONLY, which is why the landing page below can no longer be a
// single hardcoded href: pointing every role at a page most of them are
// forbidden would have walled them at login with a 404.
export const DEFAULT_HOME = "/settings/command-center";

// Where somebody goes when they can see nothing else at all. /account is the
// preferences page and is deliberately NOT module-gated, so it is reachable by
// any signed-in user and cannot itself bounce them onwards.
const FALLBACK_HOME = "/account";

// Per-request cache, keyed by userId: on "/" and on /account both the AppShell
// and the page itself resolve the same user's home, which was two identical
// round trips for one row. A save is not visible to a read later in the SAME
// request; the user-home POST route returns the href it saved, so nothing does.
export const getUserHome = cache(async (userId: string | null | undefined): Promise<string | null> => {
  if (!userId) return null;
  const row = await prisma.workspaceSetting.findFirst({ where: { scope: SCOPE, key: keyFor(userId) }, select: { valueJson: true } });
  if (!row?.valueJson) return null;
  try {
    const parsed = JSON.parse(row.valueJson) as unknown;
    return typeof parsed === "string" && parsed ? parsed : null;
  } catch {
    return null;
  }
});

export async function setUserHome(userId: string, href: string | null): Promise<void> {
  const key = keyFor(userId);
  if (!href) {
    await prisma.workspaceSetting.deleteMany({ where: { scope: SCOPE, key } });
    return;
  }
  const value = JSON.stringify(href);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key } },
    create: { scope: SCOPE, key, valueJson: value },
    update: { valueJson: value }
  });
}

export type HomeChoice = { href: string; label: string; group: string };

// The pages this user could pick as their home — exactly the nav items they can
// actually see, so a picked page is never one they lack access to.
export function visibleHomeChoices(policy: ModuleAccessPolicy, role: RoleName): HomeChoice[] {
  const choices: HomeChoice[] = [];
  for (const group of getVisibleNavigationGroups(policy, role)) {
    for (const section of group.sections) {
      for (const item of section.items) {
        choices.push({ href: item.href, label: item.label, group: group.label });
      }
    }
  }
  return choices;
}

// Where a role lands when they have expressed no preference — and, just as
// importantly, where they land when the preference they DID express points at a
// page they can no longer see.
//
// This has to be computed per role rather than read from a constant. Admins keep
// the Command Center, which is where everybody landed before it moved, so nothing
// changes for them. Everyone else gets the first nav item they can actually see,
// which is derived from the same visibility rules the sidebar uses — so it can
// never name a page the user is forbidden.
function defaultHomeFor(choices: HomeChoice[]): string {
  if (choices.some((c) => c.href === DEFAULT_HOME)) return DEFAULT_HOME;
  return choices[0]?.href ?? FALLBACK_HOME;
}

// The effective landing href: the user's choice if it's still a page they can see,
// otherwise the default for their role. Used by the root redirect and the sidebar
// Home button.
export async function resolveUserHome(userId: string | null | undefined, policy: ModuleAccessPolicy, role: RoleName): Promise<string> {
  const choices = visibleHomeChoices(policy, role);
  const fallback = defaultHomeFor(choices);
  const chosen = await getUserHome(userId);
  if (!chosen) return fallback;
  return choices.some((c) => c.href === chosen) ? chosen : fallback;
}
