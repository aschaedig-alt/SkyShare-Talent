import { prisma } from "@/lib/prisma";

// Page layouts designed via the in-page "Edit layout" mode are stored as a workspace
// setting so they are GLOBAL — whatever an admin saves becomes the layout every user
// sees. One row per page (scope "page-layout", key = page id). The value holds both the
// grid positions and any widgets added from the widget palette (type + config).

const SCOPE = "page-layout";

export type PageLayoutItem = { i: string; x: number; y: number; w: number; h: number };
export type WidgetInstance = { i: string; type: string; config: Record<string, unknown> };
export type PageLayoutState = { layout: PageLayoutItem[]; widgets: WidgetInstance[] };

function sanitizeLayout(layout: unknown): PageLayoutItem[] {
  if (!Array.isArray(layout)) return [];
  return layout
    .filter((l): l is PageLayoutItem => Boolean(l) && typeof (l as PageLayoutItem).i === "string")
    .map((l) => ({
      i: l.i,
      x: Math.max(0, Math.round(Number(l.x) || 0)),
      y: Math.max(0, Math.round(Number(l.y) || 0)),
      w: Math.max(1, Math.round(Number(l.w) || 1)),
      h: Math.max(1, Math.round(Number(l.h) || 1))
    }));
}

function sanitizeWidgets(widgets: unknown): WidgetInstance[] {
  if (!Array.isArray(widgets)) return [];
  return widgets
    .filter((w): w is WidgetInstance => Boolean(w) && typeof (w as WidgetInstance).i === "string" && typeof (w as WidgetInstance).type === "string")
    .map((w) => ({
      i: w.i,
      type: w.type,
      config: w.config && typeof w.config === "object" ? (w.config as Record<string, unknown>) : {}
    }));
}

export async function getPageLayout(key: string): Promise<PageLayoutState> {
  const setting = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key },
    select: { valueJson: true }
  });

  if (!setting?.valueJson) return { layout: [], widgets: [] };

  try {
    const parsed = JSON.parse(setting.valueJson) as { layout?: unknown; widgets?: unknown };
    return { layout: sanitizeLayout(parsed.layout), widgets: sanitizeWidgets(parsed.widgets) };
  } catch {
    return { layout: [], widgets: [] };
  }
}

export async function savePageLayout(key: string, state: { layout: unknown; widgets: unknown }): Promise<PageLayoutState> {
  const clean: PageLayoutState = {
    layout: sanitizeLayout(state.layout),
    widgets: sanitizeWidgets(state.widgets)
  };

  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key } },
    create: { scope: SCOPE, key, valueJson: JSON.stringify({ version: 2, ...clean }) },
    update: { valueJson: JSON.stringify({ version: 2, ...clean }) }
  });

  return clean;
}
