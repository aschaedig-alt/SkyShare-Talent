// Editable Crew roster — the override layer for the Crew Org Chart.
//
// The chart's numbers still originate from the curated seed in crew-data.ts
// (CREW_GROUPS). Once an admin edits the chart (moves a pilot, opens/closes a
// seat), the WHOLE groups array is stored as JSON in a single WorkspaceSetting
// (scope "fleet", key "crew-roster") — see roster.server.ts — so there's no
// schema migration. This file holds the seed default and a normalize() guard so
// a malformed stored blob can never crash the page: anything unparseable falls
// back to the seed.
//
// Leadership / training / turnover are NOT part of this override (v1 scope is
// "edit by openings and move pilots around" = the aircraft groups only); they
// stay sourced from crew-data.ts.

import type { CrewGroup, CrewPool, Departure, Seat } from "./types";
import { CREW_GROUPS } from "./crew-data";
import type { TrainingRecord } from "./training";

/**
 * Links a pilot on the chart to their Candidate record, keyed by the EXACT name
 * string as it appears on the chart. Kept separate from the roster names because
 * the two often differ, so we cannot match on the name itself; an admin points
 * each one at the right candidate once, and a move keeps the name (and link).
 * Same shape and rationale as the maintenance chart's links.
 */
export type CrewLinks = Record<string, string>;
/** Roster + candidate links + training records, all in the ONE stored blob.
    Training rides along here rather than in new database columns — see the note
    at the top of training.ts for why that matters on a shared live database. */
export type CrewRoster = { groups: CrewGroup[]; links: CrewLinks; training: TrainingRecord[] };

/** Coerce a stored/posted links blob into a safe { name: candidateId } map. */
export function normalizeCrewLinks(input: unknown): CrewLinks {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: CrewLinks = {};
  for (const [name, id] of Object.entries(input as Record<string, unknown>)) {
    const n = name.trim();
    const cid = typeof id === "string" ? id.trim() : "";
    if (n && cid) out[n] = cid;
  }
  return out;
}

/** The seed roster (deep-cloned so callers can freely mutate their copy). */
export function defaultCrewRoster(): CrewGroup[] {
  return structuredClone(CREW_GROUPS);
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

/** Coerce to a Seat, or null if there is nothing meaningful in it. */
function normalizeSeat(value: unknown): Seat | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const seat: Seat = {};
  const line = strArr(raw.line);
  const train = strArr(raw.train);
  const cand = strArr(raw.cand);
  const candInt = strArr(raw.candInt);
  const offered = strArr(raw.offered);
  const openNamed = strArr(raw.openNamed);
  const open = nonNegInt(raw.open);
  const parked = nonNegInt(raw.parked);
  if (line.length) seat.line = line;
  if (train.length) seat.train = train;
  if (cand.length) seat.cand = cand;
  if (candInt.length) seat.candInt = candInt;
  if (offered.length) seat.offered = offered;
  if (openNamed.length) seat.openNamed = openNamed;
  if (open) seat.open = open;
  if (parked) seat.parked = parked;
  return Object.keys(seat).length ? seat : null;
}

function normalizeTags(value: unknown): Record<string, string[]> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const out: Record<string, string[]> = {};
  for (const [name, tags] of Object.entries(value as Record<string, unknown>)) {
    const arr = strArr(tags);
    if (name.trim() && arr.length) out[name.trim()] = arr;
  }
  return Object.keys(out).length ? out : undefined;
}

function normalizeOut(value: unknown): Departure[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .map((v): Departure | null => {
      if (!v || typeof v !== "object") return null;
      const raw = v as Record<string, unknown>;
      const name = str(raw.name);
      if (!name) return null;
      const dep: Departure = { name };
      const to = str(raw.to);
      const reason = str(raw.reason);
      const date = str(raw.date);
      if (to) dep.to = to;
      if (reason) dep.reason = reason;
      // Only a real yyyy-mm-dd is kept — a half-parsed date here would archive
      // the wrong departures, so anything else is dropped and the row simply
      // stays visible.
      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) dep.date = date;
      return dep;
    })
    .filter((d): d is Departure => d !== null);
  return out.length ? out : undefined;
}

function normalizeGroup(value: unknown): CrewGroup | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const name = str(raw.name);
  const sub = str(raw.sub);
  const pool: CrewPool = raw.pool === "Managed" ? "Managed" : "SkyShare";
  if (!name || !sub) return null;

  const group: CrewGroup = { name, pool, sub };
  const lead = str(raw.lead);
  if (lead) group.lead = lead;

  // pic/sic are Seat | null | undefined. Preserve an explicit null (means the
  // aircraft has no such seat) vs. a real seat.
  group.pic = "pic" in raw ? normalizeSeat(raw.pic) : null;
  group.sic = "sic" in raw ? normalizeSeat(raw.sic) : null;
  const cabin = normalizeSeat(raw.cabin);
  if (cabin) group.cabin = cabin;

  const out = normalizeOut(raw.out);
  if (out) group.out = out;
  const tags = normalizeTags(raw.tags);
  if (tags) group.tags = tags;

  if (raw.poolFlown === true) group.poolFlown = true;
  if (raw.noCount === true) group.noCount = true;
  const poolNote = str(raw.poolNote);
  if (poolNote) group.poolNote = poolNote;
  const note = str(raw.note);
  if (note) group.note = note;
  const photo = str(raw.photo);
  if (photo) group.photo = photo;

  return group;
}

/** Coerce an arbitrary stored/posted blob into a safe roster. Never throws.
    Falls back to the seed if the input isn't a usable array of groups. */
export function normalizeCrewRoster(input: unknown): CrewGroup[] {
  if (!Array.isArray(input)) return defaultCrewRoster();
  const groups = input.map(normalizeGroup).filter((g): g is CrewGroup => g !== null);
  return groups.length ? groups : defaultCrewRoster();
}
