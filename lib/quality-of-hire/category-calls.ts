import { prisma } from "@/lib/prisma";
import { isCallCategory, type CategoryCall } from "@/lib/quality-of-hire/categories";

// HR's call on one hire period - the categories the data cannot decide on its own
// (Satisfactory hire, Neutral hire, and anybody let go after their first year), or a
// correction to what the rules worked out. Made on Reports > Quality of Hire by an
// admin; wins over the rules in lib/quality-of-hire/categories.ts. Same shape as the
// situational marks: one WorkspaceSetting keyed by hire period, no schema change, and
// no person's record is touched. Clearing a call puts the hire back on the rules.

const SCOPE = "workspace";
const KEY = "qoh-category-calls";

/** Keyed by hire period: `${newHireId}|${startDate YYYY-MM-DD}` (periodKey in situational.ts). */
export type CategoryCalls = Record<string, CategoryCall>;

export async function getCategoryCalls(): Promise<CategoryCalls> {
  const row = await prisma.workspaceSetting.findFirst({ where: { scope: SCOPE, key: KEY }, select: { valueJson: true } });
  if (!row?.valueJson) return {};
  try {
    const parsed = JSON.parse(row.valueJson) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: CategoryCalls = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const c = v as Partial<CategoryCall> | null;
      if (c && isCallCategory(c.category)) out[k] = { category: c.category, note: typeof c.note === "string" ? c.note : null, by: typeof c.by === "string" ? c.by : null, at: String(c.at ?? "") };
    }
    return out;
  } catch {
    return {};
  }
}

export async function setCategoryCall(key: string, call: CategoryCall | null): Promise<CategoryCalls> {
  const current = await getCategoryCalls();
  if (call) current[key] = call;
  else delete current[key];
  const value = JSON.stringify(current);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: value },
    update: { valueJson: value }
  });
  return current;
}
