// "New Hire Contacts" — the admin-curated set of SkyShare contacts a new hire
// can load onto their phone. This is deliberately NOT the whole employee
// directory: an admin picks a handful of people per department, and can add a
// synthetic shared "SkyShare Recruiting"-style contact above them.
//
// The curation lives in a single WorkspaceSetting (scope/key/valueJson) — see
// config.server.ts — so there's no schema migration. This file holds the shape,
// the default (the five departments as empty groups), and a normalize() guard so
// a malformed stored blob can never crash the public page.

// A real employee exposed to new hires. `personId` points at a NewHire record;
// the record supplies the defaults (name, title, phone, email). The optional
// overrides let an admin fix thin data or blank a personal cell they don't want
// shared — an empty string means "share nothing for this field", whereas
// undefined/null means "fall back to the record".
export type ContactMember = {
  personId: string;
  title?: string | null;
  phone?: string | null;
  email?: string | null;
};

// A synthetic, non-person contact — e.g. "SkyShare Recruiting" with the main
// line + shared inbox. Entirely admin-entered; not tied to any record.
export type SharedContact = {
  name: string;
  title?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type ContactGroup = {
  id: string; // stable slug, used in vCard download keys
  label: string; // "Recruiting"
  shared: SharedContact | null; // optional department-level contact
  members: ContactMember[];
};

export type NewHireContactsConfig = {
  intro: string; // welcome blurb shown at the top of the public page
  groups: ContactGroup[];
};

// The five functional departments the user named. These are the app's public
// grouping for onboarding and intentionally do NOT match the internal
// Crew/Maintenance/FBO/Support taxonomy in lib/calendar/departments.ts.
export const DEFAULT_GROUPS: { id: string; label: string }[] = [
  { id: "recruiting", label: "Recruiting" },
  { id: "hr", label: "HR" },
  { id: "operations", label: "Operations" },
  { id: "chief-pilot", label: "Chief Pilot" },
  { id: "accounting", label: "Accounting" }
];

export const DEFAULT_INTRO =
  "Welcome to SkyShare! Add your key contacts below so you have us saved from day one. Tap “Add” on anyone, pick several, or add a whole department at once.";

export function defaultNewHireContactsConfig(): NewHireContactsConfig {
  return {
    intro: DEFAULT_INTRO,
    groups: DEFAULT_GROUPS.map((g) => ({ id: g.id, label: g.label, shared: null, members: [] }))
  };
}

// --- normalization -------------------------------------------------------

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

// Preserve the override semantics: keep "" (explicit blank) and real strings,
// drop anything else to null (fall back to record).
function optStr(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function slug(label: string, index: number): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `group-${index + 1}`;
}

function normalizeShared(value: unknown): SharedContact | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const name = (str(raw.name) ?? "").trim();
  if (!name) return null; // a shared contact with no name is meaningless
  return { name, title: optStr(raw.title), phone: optStr(raw.phone), email: optStr(raw.email) };
}

function normalizeMember(value: unknown): ContactMember | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const personId = (str(raw.personId) ?? "").trim();
  if (!personId) return null;
  return { personId, title: optStr(raw.title), phone: optStr(raw.phone), email: optStr(raw.email) };
}

function normalizeGroup(value: unknown, index: number, usedIds: Set<string>): ContactGroup | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const label = (str(raw.label) ?? "").trim();
  if (!label) return null;

  let id = (str(raw.id) ?? "").trim() || slug(label, index);
  // Guarantee uniqueness — ids are used as vCard download keys.
  while (usedIds.has(id)) id = `${id}-${index + 1}`;
  usedIds.add(id);

  const members = Array.isArray(raw.members)
    ? raw.members.map(normalizeMember).filter((m): m is ContactMember => m !== null)
    : [];

  return { id, label, shared: normalizeShared(raw.shared), members };
}

/** Coerce an arbitrary stored/posted blob into a safe config. Never throws. */
export function normalizeNewHireContactsConfig(input: unknown): NewHireContactsConfig {
  if (!input || typeof input !== "object") return defaultNewHireContactsConfig();
  const raw = input as Record<string, unknown>;

  const usedIds = new Set<string>();
  const groups = Array.isArray(raw.groups)
    ? raw.groups.map((g, i) => normalizeGroup(g, i, usedIds)).filter((g): g is ContactGroup => g !== null)
    : [];

  return {
    intro: (str(raw.intro) ?? DEFAULT_INTRO).trim() || DEFAULT_INTRO,
    groups: groups.length ? groups : defaultNewHireContactsConfig().groups
  };
}
