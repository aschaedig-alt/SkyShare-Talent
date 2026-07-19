import { prisma } from "@/lib/prisma";

// Which hires the team has checked off the dashboard "In onboarding" worklist.
// Shared (not per-user) and reversible — a hidden hire can be shown again. Stored
// as a WorkspaceSetting so there is no schema migration.
const SCOPE = "workspace";
const KEY = "dashboard-hidden";

export async function getDashboardHiddenIds(): Promise<string[]> {
  const row = await prisma.workspaceSetting.findFirst({ where: { scope: SCOPE, key: KEY }, select: { valueJson: true } });
  if (!row?.valueJson) return [];
  try {
    const parsed = JSON.parse(row.valueJson) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

async function save(ids: string[]) {
  const value = JSON.stringify([...new Set(ids)]);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: value },
    update: { valueJson: value }
  });
}

export async function setDashboardHidden(id: string, hidden: boolean): Promise<void> {
  const current = await getDashboardHiddenIds();
  if (hidden) {
    if (!current.includes(id)) await save([...current, id]);
  } else {
    await save(current.filter((x) => x !== id));
  }
}
