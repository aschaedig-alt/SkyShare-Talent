import { prisma } from "@/lib/prisma";

// Exits the business caused rather than the hire - the Ogden FBO sale is the case
// that asked for it (Aimee, 2026-11-05: "i dont want any of those to be counted as
// bad hires. we need to be able to mark them as situational rather than automatic
// bad hire"). Marked one hire period at a time on Reports > Quality of Hire, by an
// admin, with a short note. Shared, reversible, and a WorkspaceSetting so there is
// no schema change. No person's record is touched.

const SCOPE = "workspace";
const KEY = "qoh-situational-exits";

export type SituationalMark = { note: string; by: string | null; at: string };
/** Keyed by hire period: `${newHireId}|${startDate YYYY-MM-DD}`. */
export type SituationalMarks = Record<string, SituationalMark>;

export const periodKey = (newHireId: string, start: string) => `${newHireId}|${start}`;

export async function getSituationalMarks(): Promise<SituationalMarks> {
  const row = await prisma.workspaceSetting.findFirst({ where: { scope: SCOPE, key: KEY }, select: { valueJson: true } });
  if (!row?.valueJson) return {};
  try {
    const parsed = JSON.parse(row.valueJson) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as SituationalMarks) : {};
  } catch {
    return {};
  }
}

export async function setSituational(key: string, mark: SituationalMark | null): Promise<SituationalMarks> {
  const current = await getSituationalMarks();
  if (mark) current[key] = mark;
  else delete current[key];
  const value = JSON.stringify(current);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: value },
    update: { valueJson: value }
  });
  return current;
}
