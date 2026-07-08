import { prisma } from "@/lib/prisma";
import { getNewHireContactsConfig } from "@/lib/new-hire-contacts/config.server";
import type { NewHireContactsConfig } from "@/lib/new-hire-contacts/config";

// A single contact, fully resolved (config overrides applied over the employee
// record), ready to render and to turn into a vCard. `key` is stable and is what
// the public /api/contacts/vcard endpoint accepts — so the client can only ever
// download contacts that are actually curated.
export type ResolvedContact = {
  key: string;
  fullName: string;
  title: string | null;
  phone: string | null;
  email: string | null;
  isShared: boolean; // true = synthetic "SkyShare Recruiting"-style contact
};

export type ResolvedGroup = {
  id: string;
  label: string;
  contacts: ResolvedContact[];
};

export type ResolvedNewHireContacts = {
  intro: string;
  groups: ResolvedGroup[];
};

// Override wins unless it's null/undefined (→ fall back to the record). An
// explicit empty string means "share nothing here" and resolves to null.
function resolveField(override: string | null | undefined, fallback: string | null): string | null {
  if (override === null || override === undefined) return fallback?.trim() || null;
  const trimmed = override.trim();
  return trimmed === "" ? null : trimmed;
}

async function resolveFromConfig(config: NewHireContactsConfig): Promise<ResolvedNewHireContacts> {
  const personIds = Array.from(
    new Set(config.groups.flatMap((g) => g.members.map((m) => m.personId)))
  );

  const records = personIds.length
    ? await prisma.newHire.findMany({
        where: { id: { in: personIds } },
        select: { id: true, name: true, position: true, phone: true, ssEmail: true }
      })
    : [];
  const byId = new Map(records.map((r) => [r.id, r]));

  const groups: ResolvedGroup[] = config.groups.map((group) => {
    const contacts: ResolvedContact[] = [];

    if (group.shared) {
      contacts.push({
        key: `shared:${group.id}`,
        fullName: group.shared.name,
        title: resolveField(group.shared.title, null),
        phone: resolveField(group.shared.phone, null),
        email: resolveField(group.shared.email, null),
        isShared: true
      });
    }

    for (const member of group.members) {
      const record = byId.get(member.personId);
      if (!record) continue; // employee removed since curation — skip silently
      contacts.push({
        key: `member:${group.id}:${member.personId}`,
        fullName: record.name,
        title: resolveField(member.title, record.position),
        phone: resolveField(member.phone, record.phone),
        email: resolveField(member.email, record.ssEmail),
        isShared: false
      });
    }

    return { id: group.id, label: group.label, contacts };
  });

  return { intro: config.intro, groups };
}

/** The curated contacts, resolved against current employee records. */
export async function getResolvedNewHireContacts(): Promise<ResolvedNewHireContacts> {
  return resolveFromConfig(await getNewHireContactsConfig());
}

/** Flat lookup of every resolvable contact by key — used by the vCard endpoint. */
export async function getResolvedContactsByKey(): Promise<Map<string, ResolvedContact>> {
  const resolved = await getResolvedNewHireContacts();
  return new Map(resolved.groups.flatMap((g) => g.contacts).map((c) => [c.key, c]));
}

// --- admin picker --------------------------------------------------------

export type ContactCandidate = {
  id: string;
  name: string;
  position: string | null;
  department: string | null;
  phone: string | null;
  ssEmail: string | null;
};

// Active staff (including those still onboarding), mirroring the business-cards
// roster — the pool an admin picks department contacts from.
export async function getContactCandidates(): Promise<ContactCandidate[]> {
  return prisma.newHire.findMany({
    where: { stage: { in: ["ACTIVE", "POST_ONBOARD"] }, employmentStatus: "ACTIVE" },
    select: { id: true, name: true, position: true, department: true, phone: true, ssEmail: true },
    orderBy: { name: "asc" }
  });
}
