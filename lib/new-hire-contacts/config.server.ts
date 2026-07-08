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

export type ContactSyncEntry = { personId: string; name: string; fields: string[] };

// Reverse-sync: a real (non-blank) phone/email typed as a member override on the
// contact sheet is written back to that person's employee record, then the
// now-redundant override is cleared so the sheet falls back to the record and the
// two stay in one place. Deliberately skips:
//   - "" (the "don't share" toggle) — never wipes a real record
//   - null overrides — nothing was entered
//   - shared/synthetic contacts — they have no personId, no record to update
// Returns the cleaned config (overrides removed) plus a list of who was updated.
export async function syncContactOverridesToRecords(
  input: unknown
): Promise<{ config: NewHireContactsConfig; updated: ContactSyncEntry[] }> {
  const config = normalizeNewHireContactsConfig(input);
  const personIds = Array.from(new Set(config.groups.flatMap((g) => g.members.map((m) => m.personId))));
  if (!personIds.length) return { config, updated: [] };

  const records = await prisma.newHire.findMany({
    where: { id: { in: personIds } },
    select: { id: true, name: true, phone: true, ssEmail: true }
  });
  const byId = new Map(records.map((r) => [r.id, r]));

  const isReal = (v: string | null | undefined): v is string => typeof v === "string" && v.trim() !== "";
  // Collect the intended record value per person (first real override wins if a
  // person appears in more than one group), clearing overrides as we go.
  const patches = new Map<string, { phone?: string; ssEmail?: string }>();
  for (const group of config.groups) {
    for (const member of group.members) {
      if (!byId.has(member.personId)) continue;
      const patch = patches.get(member.personId) ?? {};
      if (isReal(member.phone)) {
        if (patch.phone === undefined) patch.phone = member.phone.trim();
        member.phone = null; // migrate to the record; sheet now falls back to it
      }
      if (isReal(member.email)) {
        if (patch.ssEmail === undefined) patch.ssEmail = member.email.trim();
        member.email = null;
      }
      if (patch.phone !== undefined || patch.ssEmail !== undefined) patches.set(member.personId, patch);
    }
  }

  const updated: ContactSyncEntry[] = [];
  for (const [personId, patch] of patches) {
    const rec = byId.get(personId)!;
    const data: { phone?: string; ssEmail?: string } = {};
    const fields: string[] = [];
    if (patch.phone !== undefined && patch.phone !== (rec.phone ?? "")) {
      data.phone = patch.phone;
      fields.push("phone");
    }
    if (patch.ssEmail !== undefined && patch.ssEmail !== (rec.ssEmail ?? "")) {
      data.ssEmail = patch.ssEmail;
      fields.push("email");
    }
    if (fields.length) {
      await prisma.newHire.update({ where: { id: personId }, data });
      updated.push({ personId, name: rec.name, fields });
    }
  }

  return { config, updated };
}
