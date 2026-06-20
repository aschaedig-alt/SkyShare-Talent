/**
 * Canonical fleet registry — the single source of truth for every pilot
 * position SkyShare hires for. The human-editable master is FLEET_POSITIONS.md
 * at the repo root; `npm run fleet:sync` parses that table and regenerates the
 * RAW_FLEET_POSITIONS block below (between the fleet-sync markers). Everything
 * in the app (Jobs, Pilot Requirements, Matchboard) should resolve against this
 * list so aircraft/seat naming stays consistent everywhere.
 *
 * PURE module (no Prisma / no server-only imports) so client components can use it.
 */

export type FleetSeat = "PIC" | "SIC";
export type FleetStatus = "Active" | "Archived";

type RawPosition = {
  aircraft: string;
  typeRating: string; // shared rating, e.g. "CE-525" covers M2/CJ/CJ2; "GV" covers G450/GV
  role: string; // Captain | First Officer | Lead Captain
  seat: FleetSeat;
  title: string; // canonical display title, e.g. "PC-12 Captain"
  status: FleetStatus;
  notes: string;
};

export type FleetPosition = RawPosition & { slug: string };

// fleet-sync:start
const RAW_FLEET_POSITIONS: RawPosition[] = [
  { aircraft: "Pilatus PC-12 NGX", typeRating: "", role: "Captain", seat: "PIC", title: "PC-12 NGX Captain", status: "Archived", notes: "no type rating required" },
  { aircraft: "Pilatus PC-12 NG", typeRating: "", role: "Captain", seat: "PIC", title: "PC-12 NG Captain", status: "Archived", notes: "no type rating required" },
  { aircraft: "Pilatus PC-12", typeRating: "", role: "Captain", seat: "PIC", title: "PC-12 Captain", status: "Active", notes: "no type rating required" },
  { aircraft: "Pilatus PC-12", typeRating: "", role: "First Officer", seat: "SIC", title: "PC-12 First Officer", status: "Active", notes: "no type rating required" },
  { aircraft: "Phenom 100", typeRating: "EMB-500", role: "Captain", seat: "PIC", title: "Phenom 100 Captain", status: "Active", notes: "" },
  { aircraft: "Phenom 100", typeRating: "EMB-500", role: "First Officer", seat: "SIC", title: "Phenom 100 First Officer", status: "Active", notes: "" },
  { aircraft: "Phenom 300", typeRating: "EMB-505", role: "Captain", seat: "PIC", title: "Phenom 300 Captain", status: "Archived", notes: "" },
  { aircraft: "Phenom 300", typeRating: "EMB-505", role: "First Officer", seat: "SIC", title: "Phenom 300 First Officer", status: "Archived", notes: "" },
  { aircraft: "Citation M2", typeRating: "CE-525", role: "Captain", seat: "PIC", title: "M2 Captain", status: "Active", notes: "also advertised as CE-525 / CE525" },
  { aircraft: "Citation M2", typeRating: "CE-525", role: "First Officer", seat: "SIC", title: "M2 First Officer", status: "Active", notes: "also advertised as CE-525 / CE525" },
  { aircraft: "Citation CJ", typeRating: "CE-525", role: "Captain", seat: "PIC", title: "CJ Captain", status: "Active", notes: "also advertised as CE-525 / CE525" },
  { aircraft: "Citation CJ2", typeRating: "CE-525", role: "Captain", seat: "PIC", title: "CJ2 Captain", status: "Active", notes: "also advertised as CE-525 / CE525" },
  { aircraft: "Citation CJ2", typeRating: "CE-525", role: "First Officer", seat: "SIC", title: "CJ2 First Officer", status: "Active", notes: "also advertised as CE-525 / CE525" },
  { aircraft: "Citation 560XL", typeRating: "CE-560XL", role: "Captain", seat: "PIC", title: "560XL Captain", status: "Active", notes: "" },
  { aircraft: "Citation 560XL", typeRating: "CE-560XL", role: "First Officer", seat: "SIC", title: "560XL First Officer", status: "Active", notes: "" },
  { aircraft: "Citation 560XLS+", typeRating: "CE-560XL", role: "Captain", seat: "PIC", title: "560XLS+ Captain", status: "Archived", notes: "" },
  { aircraft: "Citation 560XLS+", typeRating: "CE-560XL", role: "First Officer", seat: "SIC", title: "560XLS+ First Officer", status: "Archived", notes: "" },
  { aircraft: "Gulfstream G200", typeRating: "G-200", role: "Captain", seat: "PIC", title: "G200 Captain", status: "Active", notes: "" },
  { aircraft: "Gulfstream G200", typeRating: "G-200", role: "First Officer", seat: "SIC", title: "G200 First Officer", status: "Active", notes: "" },
  { aircraft: "Gulfstream G450", typeRating: "G-V", role: "Lead Captain", seat: "PIC", title: "G450 Lead Captain", status: "Archived", notes: "" },
  { aircraft: "Gulfstream G450", typeRating: "G-V", role: "Captain", seat: "PIC", title: "G450 Captain", status: "Archived", notes: "" },
  { aircraft: "Gulfstream G450", typeRating: "G-V", role: "First Officer", seat: "SIC", title: "G450 First Officer", status: "Archived", notes: "" },
  { aircraft: "Gulfstream G450 & GV", typeRating: "G-V", role: "Captain", seat: "PIC", title: "G450 & GV Captain", status: "Active", notes: "" },
  { aircraft: "Gulfstream G450 & GV", typeRating: "G-V", role: "First Officer", seat: "SIC", title: "G450 & GV First Officer", status: "Active", notes: "" },
  { aircraft: "Legacy 650", typeRating: "EMB-145", role: "Lead Captain", seat: "PIC", title: "Legacy 650 Lead Captain", status: "Archived", notes: "" },
  { aircraft: "Legacy 650", typeRating: "EMB-145", role: "Captain", seat: "PIC", title: "Legacy 650 Captain", status: "Archived", notes: "" },
  { aircraft: "Legacy 650", typeRating: "EMB-145", role: "First Officer", seat: "SIC", title: "Legacy 650 First Officer", status: "Archived", notes: "" }
];
// fleet-sync:end

export function fleetSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const FLEET_POSITIONS: FleetPosition[] = RAW_FLEET_POSITIONS.map((position) => ({
  ...position,
  slug: fleetSlug(position.title)
}));

const BY_SLUG = new Map(FLEET_POSITIONS.map((position) => [position.slug, position]));

export function fleetPositionBySlug(slug: string): FleetPosition | null {
  return BY_SLUG.get(slug) ?? null;
}

export function activeFleetPositions(): FleetPosition[] {
  return FLEET_POSITIONS.filter((position) => position.status === "Active");
}

/** Aircraft that share a given type rating (e.g. "CE-525" -> M2 / CJ / CJ2). */
export function aircraftSharingTypeRating(typeRating: string): string[] {
  if (!typeRating) return [];
  const target = typeRating.toLowerCase();
  const seen = new Set<string>();
  for (const position of FLEET_POSITIONS) {
    if (position.typeRating && position.typeRating.toLowerCase() === target) seen.add(position.aircraft);
  }
  return [...seen];
}

/** Distinct aircraft in list order (size order, as authored). */
export function fleetAircraft(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const position of FLEET_POSITIONS) {
    if (!seen.has(position.aircraft)) {
      seen.add(position.aircraft);
      out.push(position.aircraft);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Best-effort resolver: map a messy free-text title (from imported jobs /
// requirements, with spellings like "Citation CE-525 Captain") onto a canonical
// position. Token-based; returns null when it can't decide confidently (e.g. a
// bare "CE-525" with no M2/CJ/CJ2 hint — those are ambiguous on purpose).
// ---------------------------------------------------------------------------

function seatOf(text: string): { seat: FleetSeat; lead: boolean } {
  if (/\blead\b/.test(text) && /\bcaptain\b/.test(text)) return { seat: "PIC", lead: true };
  if (/\b(first officer|f\/?o|sic|second in command)\b/.test(text)) return { seat: "SIC", lead: false };
  return { seat: "PIC", lead: false };
}

export function resolveFleetPosition(rawTitle: string | null | undefined): FleetPosition | null {
  if (!rawTitle) return null;
  const text = rawTitle.toLowerCase();
  const { seat, lead } = seatOf(text);

  // Aircraft tokens, most specific first so "560XLS+" wins over "560XL", etc.
  const aircraftMatchers: Array<{ test: RegExp; aircraft: string }> = [
    { test: /\bg450\b.*\bgv\b|\bgv\b.*\bg450\b/, aircraft: "Gulfstream G450 & GV" },
    { test: /\bg450\b|\bgiv\b|\bg-?450\b/, aircraft: "Gulfstream G450" },
    { test: /\bg200\b/, aircraft: "Gulfstream G200" },
    { test: /\blegacy ?650\b/, aircraft: "Legacy 650" },
    { test: /\bpc-?12 ?ngx\b/, aircraft: "Pilatus PC-12 NGX" },
    { test: /\bpc-?12 ?ng\b/, aircraft: "Pilatus PC-12 NG" },
    { test: /\bpc-?12\b|\bpilatus\b/, aircraft: "Pilatus PC-12" },
    { test: /\bphenom ?300\b/, aircraft: "Phenom 300" },
    { test: /\bphenom ?100\b|\bphenom\b/, aircraft: "Phenom 100" },
    { test: /\b560 ?xls\+?\b/, aircraft: "Citation 560XLS+" },
    { test: /\b560 ?xl\b/, aircraft: "Citation 560XL" },
    { test: /\bcj ?2\b/, aircraft: "Citation CJ2" },
    { test: /\bm2\b/, aircraft: "Citation M2" },
    { test: /\bcj\b/, aircraft: "Citation CJ" }
    // NOTE: a bare "CE-525" / "CE525" is intentionally NOT matched — it is
    // ambiguous across M2 / CJ / CJ2 and must be disambiguated by a human.
  ];

  let aircraft: string | null = null;
  for (const matcher of aircraftMatchers) {
    if (matcher.test.test(text)) {
      aircraft = matcher.aircraft;
      break;
    }
  }
  if (!aircraft) return null;

  const role = lead ? "Lead Captain" : seat === "SIC" ? "First Officer" : "Captain";
  return (
    FLEET_POSITIONS.find((position) => position.aircraft === aircraft && position.role === role) ??
    FLEET_POSITIONS.find((position) => position.aircraft === aircraft && position.seat === seat) ??
    null
  );
}

/** Canonical display title for a raw/imported title; falls back to the raw title. */
export function canonicalTitle(rawTitle: string | null | undefined): string {
  if (!rawTitle) return rawTitle ?? "";
  return resolveFleetPosition(rawTitle)?.title ?? rawTitle;
}

/**
 * Resolve a record to its fleet position, preferring an explicitly stored slug
 * (set by a recruiter in the editor) over best-effort title matching.
 */
export function positionFor(slug: string | null | undefined, rawTitle: string | null | undefined): FleetPosition | null {
  if (slug) {
    const stored = fleetPositionBySlug(slug);
    if (stored) return stored;
  }
  return resolveFleetPosition(rawTitle);
}

// ---------------------------------------------------------------------------
// Canonical ordering — every position list in the app should sort by the fleet
// registry's size order (PC-12 → … → Legacy 650), not alphabetically or by
// usage count. These helpers give a stable sort key from an aircraft name OR a
// free-text title/tag, plus a PIC-before-SIC seat rank for tie-breaking.
// ---------------------------------------------------------------------------

const AIRCRAFT_ORDER = new Map(fleetAircraft().map((aircraft, index) => [aircraft, index]));

/** Canonical size-order index for an aircraft name or free-text title. Unknown → last. */
export function fleetOrderIndex(aircraftOrTitle: string | null | undefined): number {
  if (!aircraftOrTitle) return Number.MAX_SAFE_INTEGER;
  const direct = AIRCRAFT_ORDER.get(aircraftOrTitle);
  if (direct !== undefined) return direct;
  const resolved = resolveFleetPosition(aircraftOrTitle);
  if (resolved) {
    const viaResolve = AIRCRAFT_ORDER.get(resolved.aircraft);
    if (viaResolve !== undefined) return viaResolve;
  }
  return Number.MAX_SAFE_INTEGER;
}

/** PIC/captain/lead sort before SIC/first-officer. Unknown seats sort with PIC. */
export function fleetSeatRank(seat: string | null | undefined): number {
  const value = (seat ?? "").toLowerCase();
  return /\b(sic|first officer|f\/?o|second in command)\b/.test(value) ? 1 : 0;
}

/** Distinct aircraft names for a set of fleet-position slugs (registry order). */
export function aircraftForSlugs(slugs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const slug of slugs) {
    const fp = BY_SLUG.get(slug);
    if (fp && !seen.has(fp.aircraft)) {
      seen.add(fp.aircraft);
      out.push(fp.aircraft);
    }
  }
  return out;
}
