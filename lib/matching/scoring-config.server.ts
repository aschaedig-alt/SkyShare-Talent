import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAuthRequired } from "@/lib/auth/auth-config";
import { isAdminOrRecruiter, type RoleName } from "@/lib/auth/roles";
import {
  defaultConfigDoc,
  normalizeConfigDoc,
  resolveProfileConfig,
  profileKey,
  type ScoringConfigDoc,
  type ScoringProfileConfig
} from "@/lib/matching/scoring-config";

const SCOPE = "candidate-scoring";
const KEY = "config";

export async function getScoringConfigDoc(): Promise<ScoringConfigDoc> {
  const setting = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key: KEY },
    select: { valueJson: true }
  });
  if (!setting?.valueJson) return defaultConfigDoc();
  try {
    return normalizeConfigDoc(JSON.parse(setting.valueJson));
  } catch {
    return defaultConfigDoc();
  }
}

export async function saveScoringConfigDoc(input: unknown): Promise<ScoringConfigDoc> {
  const normalized = normalizeConfigDoc(input);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: JSON.stringify(normalized) },
    update: { valueJson: JSON.stringify(normalized) }
  });
  return normalized;
}

/** Effective config for a single (aircraft, seat) profile. */
export async function getProfileScoringConfig(
  aircraft: string | null | undefined,
  seat: string | null | undefined
): Promise<ScoringProfileConfig> {
  const doc = await getScoringConfigDoc();
  return resolveProfileConfig(doc, profileKey(aircraft, seat));
}

// --- Roles: recruiters + admins may edit scoring config (honors local bypass) ---

export async function getScoringRole(): Promise<RoleName> {
  if (!isAuthRequired()) return "ADMIN";
  const session = await getServerSession(authOptions).catch(() => null);
  const role = session?.user?.role;
  return role === "ADMIN" || role === "RECRUITER" || role === "HIRING_MANAGER" || role === "VIEWER"
    ? role
    : "VIEWER";
}

export async function canEditScoring(): Promise<boolean> {
  return isAdminOrRecruiter(await getScoringRole());
}
