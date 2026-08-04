import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { normalizeBranding, emptyBranding, type WorkspaceBranding } from "@/lib/branding/shared";

// Re-export the pure helpers/types so existing server-side importers keep working.
export * from "@/lib/branding/shared";

const SCOPE = "workspace";
const KEY = "branding";

// Per-request cache: AppShell reads branding on every route for the sidebar logo,
// and a page underneath it (login, reports, /r/[token]) may read it again for its
// own logo. cache() collapses those into one round trip per request. Every caller
// is server-side; outside a React request scope it falls back to a plain call.
// Note a save is not visible to a read later in the SAME request — the branding
// POST route returns what it saved rather than re-reading, so nothing relies on it.
export const getWorkspaceBranding = cache(async (): Promise<WorkspaceBranding> => {
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
});

export async function saveWorkspaceBranding(branding: unknown): Promise<WorkspaceBranding> {
  const normalized = normalizeBranding(branding);

  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: JSON.stringify(normalized) },
    update: { valueJson: JSON.stringify(normalized) }
  });

  return normalized;
}
