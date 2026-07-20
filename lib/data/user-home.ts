import { prisma } from "@/lib/prisma";
import { getVisibleNavigationGroups, type ModuleAccessPolicy } from "@/lib/navigation/modules";
import type { RoleName } from "@/lib/auth/roles";

// Each user's chosen default landing page. It is PER-USER (keyed by the user id),
// but stored in the shared WorkspaceSetting table so there is no schema migration
// against the live DB — scope "user-pref", key `home:<userId>`, value = the href.
const SCOPE = "user-pref";
const keyFor = (userId: string) => `home:${userId}`;

export const DEFAULT_HOME = "/command-center";

export async function getUserHome(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const row = await prisma.workspaceSetting.findFirst({ where: { scope: SCOPE, key: keyFor(userId) }, select: { valueJson: true } });
  if (!row?.valueJson) return null;
  try {
    const parsed = JSON.parse(row.valueJson) as unknown;
    return typeof parsed === "string" && parsed ? parsed : null;
  } catch {
    return null;
  }
}

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

// The effective landing href: the user's choice if it's still a page they can see,
// otherwise the default. Used by the root redirect and the sidebar Home button.
export async function resolveUserHome(userId: string | null | undefined, policy: ModuleAccessPolicy, role: RoleName): Promise<string> {
  const chosen = await getUserHome(userId);
  if (!chosen) return DEFAULT_HOME;
  return visibleHomeChoices(policy, role).some((c) => c.href === chosen) ? chosen : DEFAULT_HOME;
}
