import { prisma } from "@/lib/prisma";
import { normalizeBranding, emptyBranding, type WorkspaceBranding } from "@/lib/branding/shared";

// Re-export the pure helpers/types so existing server-side importers keep working.
export * from "@/lib/branding/shared";

const SCOPE = "workspace";
const KEY = "branding";

export async function getWorkspaceBranding(): Promise<WorkspaceBranding> {
  const setting = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key: KEY },
    select: { valueJson: true }
  });

  if (!setting?.valueJson) {
    return emptyBranding();
  }

  try {
    return normalizeBranding(JSON.parse(setting.valueJson) as unknown);
  } catch {
    return emptyBranding();
  }
}

export async function saveWorkspaceBranding(branding: unknown): Promise<WorkspaceBranding> {
  const normalized = normalizeBranding(branding);

  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: JSON.stringify(normalized) },
    update: { valueJson: JSON.stringify(normalized) }
  });

  return normalized;
}
