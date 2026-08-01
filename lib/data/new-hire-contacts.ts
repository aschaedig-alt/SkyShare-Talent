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

/**
 * Resolve an arbitrary config against current employee records. Exported (rather
 * than only reachable via the stored setting) so the show/hide and override rules
 * can be exercised against a synthetic config without writing to the live shared
 * WorkspaceSetting.
 */
export async function resolveNewHireContacts(config: NewHireContactsConfig): Promise<ResolvedNewHireContacts> {
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

    // Manual contacts lead the group — a department line reads as the group's
    // "front door" before the named people under it.
    for (const entry of group.manual) {
      if (!entry.enabled) continue;
      contacts.push({
        key: `manual:${group.id}:${entry.id}`,
        fullName: entry.name,
        title: resolveField(entry.title, null),
        phone: resolveField(entry.phone, null),
        email: resolveField(entry.email, null),
        isShared: entry.kind === "department"
      });
    }

    for (const member of group.members) {
      if (!member.enabled) continue;
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

  // A group whose every contact is switched off would render as a bare heading.
  return { intro: config.intro, groups: groups.filter((g) => g.contacts.length > 0) };
}

/** The curated contacts, resolved against current employee records. */
export async function getResolvedNewHireContacts(): Promise<ResolvedNewHireContacts> {
  return resolveNewHireContacts(await getNewHireContactsConfig());
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
  /** False for someone already curated who has since left — badged, not hidden. */
  isCurrent: boolean;
};

// Everyone currently on staff, which is what an admin needs to pick from.
//
// This used to filter on `stage IN (ACTIVE, POST_ONBOARD)`, and that was the bug
// behind both "Unknown employee" and the near-empty picker: stage tracks the
// ONBOARDING lifecycle, and a hire auto-archives to ARCHIVED once onboarding
// finishes while staying employmentStatus ACTIVE. So the old pool held only the
// ~28 people mid-onboarding and excluded every settled employee — which is to
// say, every person you'd actually name as a department contact. Employment
// status, not stage, is the question being asked here.
//
// `alwaysInclude` pins ids that are already curated so a contact can never
// silently drop out of the admin again — if they've left, they come back badged
// as a former employee instead of rendering as "Unknown".
export async function getContactCandidates(alwaysInclude: string[] = []): Promise<ContactCandidate[]> {
  const current = { employmentStatus: { in: ["ACTIVE", "CONTRACT"] } };
  const rows = await prisma.newHire.findMany({
    where: alwaysInclude.length ? { OR: [current, { id: { in: alwaysInclude } }] } : current,
    select: {
      id: true,
      name: true,
      position: true,
      department: true,
      phone: true,
      ssEmail: true,
      employmentStatus: true
    },
    orderBy: { name: "asc" }
  });

  return rows.map(({ employmentStatus, ...rest }) => ({
    ...rest,
    isCurrent: employmentStatus === "ACTIVE" || employmentStatus === "CONTRACT"
  }));
}
