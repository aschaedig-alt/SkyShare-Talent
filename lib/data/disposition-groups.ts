import { prisma } from "@/lib/prisma";
import {
  DISPOSITION_LABEL,
  reasonKey,
  type DispositionGroup,
  type DispositionOverrides
} from "@/lib/candidates/buckets";

/**
 * Chosen groups for disposition wordings.
 *
 * The grouper in lib/candidates/buckets.ts folds ~39 Paycom wordings into 12
 * groups by pattern. It is a good guess at text nobody wrote for us, and when it
 * guesses wrong there was previously no way to correct it short of editing code.
 * This is that correction: a wording -> group map that beats the patterns.
 *
 * NOTHING IS REWRITTEN. An override changes how a wording is CLASSIFIED, not
 * what any application says. Removing the override puts that wording straight
 * back on the pattern's answer.
 */
const SCOPE = "candidate-vocab";
const KEY = "disposition-groups";

const VALID = new Set(Object.keys(DISPOSITION_LABEL));

export function sanitizeOverrides(raw: unknown): DispositionOverrides {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: DispositionOverrides = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = reasonKey(k);
    if (!key || key.length > 200) continue;
    if (typeof v !== "string" || !VALID.has(v)) continue;
    out[key] = v as DispositionGroup;
  }
  return out;
}

export async function getDispositionOverrides(): Promise<DispositionOverrides> {
  const setting = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key: KEY },
    select: { valueJson: true }
  });
  if (!setting?.valueJson) return {};
  try {
    return sanitizeOverrides(JSON.parse(setting.valueJson));
  } catch {
    // A corrupt row must not break grouping — fall back to the patterns.
    return {};
  }
}

export async function saveDispositionOverrides(raw: unknown): Promise<DispositionOverrides> {
  const clean = sanitizeOverrides(raw);
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
