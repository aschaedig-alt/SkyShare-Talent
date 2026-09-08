import { prisma } from "@/lib/prisma";

/**
 * Which tags are archived — put away, not deleted.
 *
 * WHY THIS IS A SETTING AND NOT A COLUMN. Archiving is a view preference, not a
 * fact about the tag, and this repo has no migrations — schema changes go
 * straight at the live shared database with `db push`. A stored list of labels
 * does the same job with no schema change, no push, and a one-line undo, and it
 * matches how the stage list and the disposition-group overrides already work.
 *
 * WHAT ARCHIVING DOES: the tag stops appearing in the Tags column and in the
 * tag filter's normal list. NOTHING IS REMOVED — every candidate keeps the tag,
 * the manage page still lists it with its counts, and restoring is one click.
 * That is the difference from Delete, which takes the tag off everybody.
 *
 * Labels are stored NORMALISED (lowercased) so a later rename of the tag does
 * not silently un-archive it... which it would, and that is worth knowing:
 * renaming an archived tag DOES un-archive it, because the label is the key.
 * Acceptable for now — renaming something you have put away is rare, and the
 * alternative is the schema change this exists to avoid.
 */
const SCOPE = "candidate-vocab";
const KEY = "archived-tags";

export function sanitizeArchivedTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const k = item.trim().toLowerCase();
    if (k && k.length <= 60) seen.add(k);
  }
  return [...seen].sort();
}

export async function getArchivedTags(): Promise<Set<string>> {
  const setting = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key: KEY },
    select: { valueJson: true }
  });
  if (!setting?.valueJson) return new Set();
  try {
    return new Set(sanitizeArchivedTags(JSON.parse(setting.valueJson)));
  } catch {
    // A corrupt row must not hide every tag.
    return new Set();
  }
}

export async function saveArchivedTags(raw: unknown): Promise<string[]> {
  const clean = sanitizeArchivedTags(raw);
  const existing = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key: KEY },
    select: { id: true }
  });
  const valueJson = JSON.stringify(clean);
  if (existing) {
    await prisma.workspaceSetting.update({ where: { id: existing.id }, data: { valueJson } });
  } else {
    await prisma.workspaceSetting.create({ data: { scope: SCOPE, key: KEY, valueJson } });
  }
  return clean;
}
