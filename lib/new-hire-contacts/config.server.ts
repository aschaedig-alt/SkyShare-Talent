import { prisma } from "@/lib/prisma";
import {
  defaultNewHireContactsConfig,
  normalizeNewHireContactsConfig,
  type NewHireContactsConfig
} from "@/lib/new-hire-contacts/config";

const SCOPE = "new-hire-contacts";
const KEY = "config";

export async function getNewHireContactsConfig(): Promise<NewHireContactsConfig> {
  const setting = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key: KEY },
    select: { valueJson: true }
  });
  if (!setting?.valueJson) return defaultNewHireContactsConfig();
  try {
    return normalizeNewHireContactsConfig(JSON.parse(setting.valueJson));
  } catch {
    return defaultNewHireContactsConfig();
  }
}

export async function saveNewHireContactsConfig(input: unknown): Promise<NewHireContactsConfig> {
  const normalized = normalizeNewHireContactsConfig(input);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: JSON.stringify(normalized) },
    update: { valueJson: JSON.stringify(normalized) }
  });
  return normalized;
}
