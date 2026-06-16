import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { isAuthRequired } from "@/lib/auth/auth-config";
import { POINTS_PER_DOLLAR } from "@/lib/compliments/constants";

// Compliments program policy. Stored as JSON in the existing WorkspaceSetting
// table (scope "compliments", key "settings") so no new schema is needed.
export type ComplimentsSettings = {
  pointsPerDollar: number; // conversion: this many points = $1
  monthlyBudgetUsd: number; // budget target the cost dashboard tracks against
  strengthPoints: { GOOD: number; GREAT: number; AMAZING: number }; // award amounts
};

export const DEFAULT_COMPLIMENTS_SETTINGS: ComplimentsSettings = {
  pointsPerDollar: POINTS_PER_DOLLAR,
  monthlyBudgetUsd: 1000,
  strengthPoints: { GOOD: 50, GREAT: 75, AMAZING: 100 }
};

const SCOPE = "compliments";
const KEY = "settings";

function coerceNumber(value: unknown, fallback: number, { min = 0 }: { min?: number } = {}): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < min) return fallback;
  return n;
}

function normalize(raw: unknown): ComplimentsSettings {
  const d = DEFAULT_COMPLIMENTS_SETTINGS;
  if (!raw || typeof raw !== "object") return { ...d, strengthPoints: { ...d.strengthPoints } };
  const r = raw as Partial<ComplimentsSettings> & { strengthPoints?: Partial<ComplimentsSettings["strengthPoints"]> };
  return {
    pointsPerDollar: coerceNumber(r.pointsPerDollar, d.pointsPerDollar, { min: 1 }),
    monthlyBudgetUsd: coerceNumber(r.monthlyBudgetUsd, d.monthlyBudgetUsd, { min: 0 }),
    strengthPoints: {
      GOOD: coerceNumber(r.strengthPoints?.GOOD, d.strengthPoints.GOOD, { min: 0 }),
      GREAT: coerceNumber(r.strengthPoints?.GREAT, d.strengthPoints.GREAT, { min: 0 }),
      AMAZING: coerceNumber(r.strengthPoints?.AMAZING, d.strengthPoints.AMAZING, { min: 0 })
    }
  };
}

export async function getComplimentsSettings(): Promise<ComplimentsSettings> {
  const setting = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key: KEY },
    select: { valueJson: true }
  });
  if (!setting?.valueJson) return normalize(null);
  try {
    return normalize(JSON.parse(setting.valueJson));
  } catch {
    return normalize(null);
  }
}

export async function saveComplimentsSettings(input: unknown): Promise<ComplimentsSettings> {
  const normalized = normalize(input);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: JSON.stringify(normalized) },
    update: { valueJson: JSON.stringify(normalized) }
  });
  return normalized;
}

// Resolve the current viewer's role honoring the local auth-bypass (which
// requireModulePageAccess also treats as ADMIN).
export async function getComplimentsRole(): Promise<string> {
  if (!isAuthRequired()) return "ADMIN";
  const session = await getServerSession(authOptions).catch(() => null);
  return session?.user?.role ?? "VIEWER";
}

export async function isComplimentsAdmin(): Promise<boolean> {
  return (await getComplimentsRole()) === "ADMIN";
}
