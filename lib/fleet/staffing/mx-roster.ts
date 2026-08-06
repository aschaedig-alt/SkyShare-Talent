// Editable Maintenance roster — the override layer for the Maintenance Org Chart.
//
// Mirrors the Crew roster override (see roster.ts): the chart's numbers still
// originate from the curated seed in maintenance-data.ts (MX_GROUPS). Once an
// admin edits the chart, the WHOLE groups array is stored as JSON in a single
// WorkspaceSetting (scope "fleet", key "mx-roster") — see mx-roster.server.ts —
// so there's no schema migration. normalizeMxRoster() guards a malformed stored
// blob: anything unusable falls back to the seed.

import type { MxGroup, MxPool, MxSection } from "./types";
import { MX_GROUPS } from "./maintenance-data";

/**
 * Links a person on the chart to their Candidate record, keyed by the EXACT name
 * string as it appears on the chart. Kept separate from the roster names because
 * the two often differ — the chart says "Augustin Quintero", his candidate
 * profile says "Auggie Quintero" — so we cannot match on the name itself; an
 * admin points each one at the right candidate once, and moving them keeps the
 * name string (and therefore the link) intact.
 */
export type MxLinks = Record<string, string>;

/** What the mx-roster WorkspaceSetting stores: the roster plus the name→candidate links. */
export type MxRoster = { groups: MxGroup[]; links: MxLinks };

/** The seed roster (deep-cloned so callers can freely mutate their copy). */
export function defaultMxRoster(): MxGroup[] {
  return structuredClone(MX_GROUPS);
}

/** Coerce a stored/posted links blob into a safe { name: candidateId } map. */
export function normalizeMxLinks(input: unknown): MxLinks {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: MxLinks = {};
  for (const [name, id] of Object.entries(input as Record<string, unknown>)) {
    const n = name.trim();
    const cid = typeof id === "string" ? id.trim() : "";
    if (n && cid) out[n] = cid;
  }
  return out;
}

// --- normalization -------------------------------------------------------

function strArr(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => (typeof v === "string" ? v.trim() : "")).filter((v) => v.length > 0);
}

function nonNegInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** A { name: text } map with both halves trimmed and empties dropped. */
function strMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const name = key.trim();
    const text = typeof raw === "string" ? raw.trim() : "";
    if (name && text) out[name] = text;
  }
  return out;
}

/** A maintenance section is a Seat (line/train/cand/candInt/open/openNamed/parked) plus a label. */
function normalizeSection(value: unknown): MxSection | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const label = str(raw.label);
  if (!label) return null;
  const sec: MxSection = { label };
  const line = strArr(raw.line);
  const train = strArr(raw.train);
  const cand = strArr(raw.cand);
  const candInt = strArr(raw.candInt);
  const offered = strArr(raw.offered);
  const openNamed = strArr(raw.openNamed);
  const open = nonNegInt(raw.open);
  const parked = nonNegInt(raw.parked);
  if (line.length) sec.line = line;
  if (train.length) sec.train = train;
  if (cand.length) sec.cand = cand;
  if (candInt.length) sec.candInt = candInt;
  if (offered.length) sec.offered = offered;
  if (openNamed.length) sec.openNamed = openNamed;
  if (open) sec.open = open;
  if (parked) sec.parked = parked;

  const reportsTo = str(raw.reportsTo);
  if (reportsTo) sec.reportsTo = reportsTo;
  const roles = strMap(raw.roles);
  if (Object.keys(roles).length) sec.roles = roles;

  return sec;
}

function normalizeGroup(value: unknown): MxGroup | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const name = str(raw.name);
  const sub = str(raw.sub);
  const mgr = str(raw.mgr);
  if (!name || !sub || !mgr) return null;
  const pool: MxPool = raw.pool === "Admin" ? "Admin" : "Line";
  const sections = Array.isArray(raw.sections)
    ? raw.sections.map(normalizeSection).filter((s): s is MxSection => s !== null)
    : [];
  return { name, pool, sub, mgr, sections };
}

/** Coerce an arbitrary stored/posted blob into a safe roster. Never throws.
    Falls back to the seed if the input isn't a usable array of groups. */
export function normalizeMxRoster(input: unknown): MxGroup[] {
  if (!Array.isArray(input)) return defaultMxRoster();
  const groups = input.map(normalizeGroup).filter((g): g is MxGroup => g !== null);
  return groups.length ? groups : defaultMxRoster();
}
