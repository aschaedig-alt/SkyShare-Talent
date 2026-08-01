// "New Hire Contacts" — the admin-curated set of SkyShare contacts a new hire
// can load onto their phone. This is deliberately NOT the whole employee
// directory: an admin picks people per department and can add contacts that
// aren't employee records at all (a department line, or someone not yet in the
// app).
//
// The curation lives in a single WorkspaceSetting (scope/key/valueJson) — see
// config.server.ts — so there's no schema migration. This file holds the shape,
// the default (the main departments as empty groups), and a normalize() guard so
// a malformed stored blob can never crash the public page.

// A real employee exposed to new hires. `personId` points at a NewHire record;
// the record supplies the defaults (name, title, phone, email). The optional
// overrides let an admin fix thin data or blank a personal cell they don't want
// shared — an empty string means "share nothing for this field", whereas
// undefined/null means "fall back to the record".
//
// `enabled` is the master-list switch: false keeps the person curated (so they
// stay one click from being restored) but hides them from /welcome.
export type ContactMember = {
  personId: string;
  title?: string | null;
  phone?: string | null;
  email?: string | null;
  enabled: boolean;
};

// A contact with no employee record behind it. Two flavours, distinguished by
// `kind` because they read differently to a new hire:
//   department — a shared line/inbox ("SkyShare Marketing"); shows an SS badge
//   person     — a real individual who isn't in the app yet; shows their initials
// Both are entirely admin-entered. `id` is stable within the group and forms the
// vCard key, so renaming a contact never breaks an in-flight download.
export type ManualContact = {
  id: string;
  kind: "department" | "person";
  name: string;
  title?: string | null;
  phone?: string | null;
  email?: string | null;
  enabled: boolean;
};

export type ContactGroup = {
  id: string; // stable slug, used in vCard download keys
  label: string; // "Recruiting"
  manual: ManualContact[];
  members: ContactMember[];
};

export type NewHireContactsConfig = {
  intro: string; // welcome blurb shown at the top of the public page
  groups: ContactGroup[];
};

// The main departments a new hire is introduced to. These are the app's public
// grouping for onboarding and intentionally do NOT match the internal
// Crew/Maintenance/FBO/Support taxonomy in lib/calendar/departments.ts. They
// only seed a workspace that has never been curated — an existing stored config
// always wins.
export const DEFAULT_GROUPS: { id: string; label: string }[] = [
  { id: "executives", label: "Executives" },
  { id: "recruiting", label: "Recruiting" },
  { id: "hr", label: "HR" },
  { id: "operations", label: "Operations" },
  { id: "maintenance", label: "Maintenance" },
  { id: "safety-compliance", label: "Safety & Compliance" },
  { id: "accounting", label: "Accounting" },
  { id: "marketing", label: "Marketing" }
];

export const DEFAULT_INTRO =
  "Welcome to SkyShare! Add your key contacts below so you have us saved from day one. Tap “Add” on anyone, pick several, or add a whole department at once.";

export function defaultNewHireContactsConfig(): NewHireContactsConfig {
  return {
    intro: DEFAULT_INTRO,
    groups: DEFAULT_GROUPS.map((g) => ({ id: g.id, label: g.label, manual: [], members: [] }))
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

// Absent means shown. Every contact curated before the show/hide switch existed
// was, by definition, visible — so a missing flag must not hide anyone.
function enabledFlag(value: unknown): boolean {
  return value === false ? false : true;
}

export function slugify(label: string, fallback: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || fallback;
}

function normalizeManual(value: unknown, index: number, usedIds: Set<string>): ManualContact | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const name = (str(raw.name) ?? "").trim();
  if (!name) return null; // a contact with no name is meaningless

  let id = (str(raw.id) ?? "").trim() || slugify(name, `contact-${index + 1}`);
  while (usedIds.has(id)) id = `${id}-${index + 1}`;
  usedIds.add(id);

  return {
    id,
    kind: raw.kind === "person" ? "person" : "department",
    name,
    title: optStr(raw.title),
    phone: optStr(raw.phone),
    email: optStr(raw.email),
    enabled: enabledFlag(raw.enabled)
  };
}

function normalizeMember(value: unknown): ContactMember | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const personId = (str(raw.personId) ?? "").trim();
  if (!personId) return null;
  return {
    personId,
    title: optStr(raw.title),
    phone: optStr(raw.phone),
    email: optStr(raw.email),
    enabled: enabledFlag(raw.enabled)
  };
}

function normalizeGroup(value: unknown, index: number, usedIds: Set<string>): ContactGroup | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const label = (str(raw.label) ?? "").trim();
  if (!label) return null;

  let id = (str(raw.id) ?? "").trim() || slugify(label, `group-${index + 1}`);
  // Guarantee uniqueness — ids are used as vCard download keys.
  while (usedIds.has(id)) id = `${id}-${index + 1}`;
  usedIds.add(id);

  const members = Array.isArray(raw.members)
    ? raw.members.map(normalizeMember).filter((m): m is ContactMember => m !== null)
    : [];

  // Manual contacts used to be a single optional `shared` slot per group. Fold a
  // legacy blob into the list so a config written before this change keeps its
  // department contact — and keep the id "shared" so nothing else has to care.
  const manualIds = new Set<string>();
  const manual = Array.isArray(raw.manual)
    ? raw.manual.map((m, i) => normalizeManual(m, i, manualIds)).filter((m): m is ManualContact => m !== null)
    : [];
  if (!manual.length && raw.shared) {
    const legacy = normalizeManual({ ...(raw.shared as object), id: "shared", kind: "department" }, 0, manualIds);
    if (legacy) manual.push(legacy);
  }

  return { id, label, manual, members };
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
