import { prisma } from "@/lib/prisma";

// Page layouts designed via the in-page "Edit layout" mode are stored as a workspace
// setting so they are GLOBAL — whatever an admin saves becomes the layout every user
// sees. One row per page (scope "page-layout", key = page id).

const SCOPE = "page-layout";

export type PageLayoutItem = { i: string; x: number; y: number; w: number; h: number };

function sanitize(layout: PageLayoutItem[]): PageLayoutItem[] {
  return layout
    .filter((l) => l && typeof l.i === "string")
    .map((l) => ({
      i: l.i,
      x: Math.max(0, Math.round(Number(l.x) || 0)),
      y: Math.max(0, Math.round(Number(l.y) || 0)),
      w: Math.max(1, Math.round(Number(l.w) || 1)),
      h: Math.max(1, Math.round(Number(l.h) || 1))
    }));
}

export async function getPageLayout(key: string): Promise<PageLayoutItem[] | null> {
  const setting = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key },
    select: { valueJson: true }
  });

  if (!setting?.valueJson) return null;

  try {
    const parsed = JSON.parse(setting.valueJson) as { layout?: PageLayoutItem[] };
    return Array.isArray(parsed.layout) ? sanitize(parsed.layout) : null;
  } catch {
    return null;
  }
}

export async function savePageLayout(key: string, layout: PageLayoutItem[]): Promise<PageLayoutItem[]> {
  const clean = sanitize(layout);

  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key } },
    create: { scope: SCOPE, key, valueJson: JSON.stringify({ version: 1, layout: clean }) },
    update: { valueJson: JSON.stringify({ version: 1, layout: clean }) }
  });

  return clean;
}
