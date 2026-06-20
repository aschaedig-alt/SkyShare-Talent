/**
 * Candidate scoring configuration — PURE module (no Prisma, safe to import from
 * client components). Holds the category list, the configurable-requirement
 * catalog, defaults, and the normalize/merge helpers.
 *
 * The score is DECISION SUPPORT for triage ("who to screen first") — never a
 * ranking and never a reject. By policy the engine ignores age, name, gender and
 * location; those can never become factors (see BANNED_SIGNALS below).
 *
 * Persisted as JSON in the WorkspaceSetting table (scope "candidate-scoring",
 * key "config") by scoring-config.server.ts — no schema migration needed.
 */

// ---------------------------------------------------------------------------
// Categories (the six sub-scores that roll up into the overall read)
// ---------------------------------------------------------------------------

export const SCORING_CATEGORIES = [
  "aircraft",
  "seat",
  "hourMins",
  "timeInType",
  "recency",
  "certs"
] as const;

export type CategoryKey = (typeof SCORING_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  aircraft: "Aircraft fit",
  seat: "Seat fit",
  hourMins: "Hour minimums",
  timeInType: "Time in type",
  recency: "Recency / currency",
  certs: "Certs & ratings"
};

// ---------------------------------------------------------------------------
// Configurable requirements (each is hard / soft / none per position)
//   - hours      : compared against the role's gate minimum (near-miss aware)
//   - timeInType : "more is better", scaled to a target
//   - typeRating : the role's aircraft type rating present on the candidate
//   - cert       : a boolean certificate / currency
// `gateKey` links an hours requirement to the PilotRequirementGate that carries
// the role-specific minimum; `metricKey` links to the CandidateMetric that holds
// the candidate's structured value (keys differ by design across the two tables).
// ---------------------------------------------------------------------------

export type ReqStatus = "hard" | "soft" | "bonus" | "none";
export type ReqKind = "hours" | "timeInType" | "typeRating" | "cert";

export type ScoringRequirementDef = {
  key: string;
  label: string;
  category: CategoryKey;
  kind: ReqKind;
  gateKey?: string;
  metricKey?: string;
  defaultStatus: ReqStatus;
};

export const SCORING_REQUIREMENTS: ScoringRequirementDef[] = [
  { key: "total_time", label: "Total time", category: "hourMins", kind: "hours", gateKey: "total_time", metricKey: "total_time", defaultStatus: "hard" },
  { key: "pic_time", label: "PIC time", category: "hourMins", kind: "hours", gateKey: "pic_time", metricKey: "pic", defaultStatus: "hard" },
  { key: "sic_time", label: "SIC time", category: "hourMins", kind: "hours", gateKey: "sic_time", metricKey: "sic", defaultStatus: "soft" },
  { key: "turbine_time", label: "Turbine time", category: "hourMins", kind: "hours", gateKey: "turbine_time", metricKey: "turbine", defaultStatus: "soft" },
  { key: "multi_engine_time", label: "Multi-engine time", category: "hourMins", kind: "hours", gateKey: "multi_engine_time", metricKey: "multi_engine", defaultStatus: "soft" },
  { key: "jet_time", label: "Jet time", category: "hourMins", kind: "hours", gateKey: "jet_time", metricKey: "jet", defaultStatus: "soft" },
  { key: "instrument_time", label: "Instrument time", category: "hourMins", kind: "hours", gateKey: "instrument_time", metricKey: "instrument", defaultStatus: "soft" },
  { key: "night_time", label: "Night time", category: "hourMins", kind: "hours", gateKey: "night_time", metricKey: "night", defaultStatus: "soft" },
  { key: "cross_country_time", label: "Cross-country time", category: "hourMins", kind: "hours", gateKey: "cross_country_time", metricKey: "cross_country", defaultStatus: "soft" },
  { key: "time_in_type", label: "Time in type", category: "timeInType", kind: "timeInType", defaultStatus: "soft" },
  { key: "type_rating", label: "Aircraft type rating", category: "aircraft", kind: "typeRating", metricKey: "type_ratings", defaultStatus: "hard" },
  { key: "atp_certificate", label: "Commercial pilot certificate or ATP", category: "certs", kind: "cert", gateKey: "atp_certificate", metricKey: "certificates", defaultStatus: "hard" },
  { key: "medical_class", label: "Medical certificate", category: "certs", kind: "cert", metricKey: "medical_class", defaultStatus: "soft" },
  { key: "current_ifr", label: "Instrument currency", category: "certs", kind: "cert", gateKey: "current_ifr", metricKey: "instrument", defaultStatus: "soft" }
];

export const SCORING_REQUIREMENT_MAP: Record<string, ScoringRequirementDef> = Object.fromEntries(
  SCORING_REQUIREMENTS.map((req) => [req.key, req])
);

// Signals that must NEVER influence the score (fairness / legal policy).
export const BANNED_SIGNALS = ["age", "name", "gender", "location"] as const;

// ---------------------------------------------------------------------------
// Config shape
// ---------------------------------------------------------------------------

export type HoursLogic = {
  /** A candidate within this fraction below a minimum still earns partial credit. */
  nearMissTolerancePct: number;
  /** Fraction of full credit awarded for a near-miss (0–1). */
  nearMissCredit: number;
  /** Extra fraction added to the hour-minimums sub-score when ALL minimums are met (0–1). */
  completenessBonus: number;
  /** Hours in type that earn full time-in-type credit ("more is better" caps here). */
  timeInTypeTargetHours: number;
  /** Hours flown in the last 12 months at/above which a candidate reads as "current". */
  recencyMinHours12mo: number;
};

export type ReadinessThresholds = {
  /** Overall score at/above which a candidate reads as a strong signal. */
  strong: number;
  /** Overall score at/above which a candidate is worth a look. */
  possible: number;
};

/** A recruiter-defined cert/rating row. Matches if ANY of `terms` appears in the
 *  candidate's certificates/text — i.e. each custom cert is its own either/or group. */
export type CustomCert = {
  id: string;
  label: string;
  terms: string[];
  status: ReqStatus;
};

export type ScoringProfileConfig = {
  weights: Record<CategoryKey, number>;
  requirements: Record<string, ReqStatus>;
  hours: HoursLogic;
  readiness: ReadinessThresholds;
  /** Recruiter-added cert/rating rows beyond the built-in set. */
  customCerts: CustomCert[];
};

export type ScoringConfigDoc = {
  version: 1;
  default: ScoringProfileConfig;
  profiles: Record<string, ScoringProfileConfig>;
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_WEIGHTS: Record<CategoryKey, number> = {
  aircraft: 25,
  seat: 20,
  hourMins: 25,
  timeInType: 12,
  // Recency = currency: scored from the candidate's "hours flown in last 12
  // months" metric vs the configurable threshold (see recencyMinHours12mo).
  recency: 8,
  certs: 10
};

export const DEFAULT_HOURS_LOGIC: HoursLogic = {
  nearMissTolerancePct: 0.1,
  nearMissCredit: 0.5,
  completenessBonus: 0.25,
  timeInTypeTargetHours: 500,
  recencyMinHours12mo: 100
};

export const DEFAULT_READINESS: ReadinessThresholds = {
  strong: 65,
  possible: 35
};

function defaultRequirementStatuses(): Record<string, ReqStatus> {
  return Object.fromEntries(SCORING_REQUIREMENTS.map((req) => [req.key, req.defaultStatus]));
}

export function defaultProfileConfig(): ScoringProfileConfig {
  return {
    weights: { ...DEFAULT_WEIGHTS },
    requirements: defaultRequirementStatuses(),
    hours: { ...DEFAULT_HOURS_LOGIC },
    readiness: { ...DEFAULT_READINESS },
    customCerts: []
  };
}

export function defaultConfigDoc(): ScoringConfigDoc {
  return { version: 1, default: defaultProfileConfig(), profiles: {} };
}

// ---------------------------------------------------------------------------
// Profile keys — a profile is one (aircraft, seat) combination
// ---------------------------------------------------------------------------

export function slug(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Stable key for an (aircraft, seat) profile. Empty parts collapse to "any". */
export function profileKey(aircraft: string | null | undefined, seat: string | null | undefined): string {
  return `${slug(aircraft) || "any"}::${slug(seat) || "any"}`;
}

export function profileLabel(aircraft: string | null | undefined, seat: string | null | undefined): string {
  return `${aircraft?.trim() || "Any aircraft"} · ${seat?.trim() || "Any seat"}`;
}

// ---------------------------------------------------------------------------
// Normalize / validate (defensive — config is user-edited JSON)
// ---------------------------------------------------------------------------

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeStatus(value: unknown, fallback: ReqStatus): ReqStatus {
  return value === "hard" || value === "soft" || value === "bonus" || value === "none" ? value : fallback;
}

export function normalizeProfileConfig(raw: unknown): ScoringProfileConfig {
  const base = defaultProfileConfig();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<ScoringProfileConfig>;

  const weights = { ...base.weights };
  if (r.weights && typeof r.weights === "object") {
    for (const key of SCORING_CATEGORIES) {
      weights[key] = Math.round(clampNumber((r.weights as Record<string, unknown>)[key], base.weights[key], 0, 100));
    }
  }

  const requirements = { ...base.requirements };
  if (r.requirements && typeof r.requirements === "object") {
    for (const req of SCORING_REQUIREMENTS) {
      requirements[req.key] = normalizeStatus(
        (r.requirements as Record<string, unknown>)[req.key],
        req.defaultStatus
      );
    }
  }

  const hours: HoursLogic = {
    nearMissTolerancePct: clampNumber(r.hours?.nearMissTolerancePct, base.hours.nearMissTolerancePct, 0, 0.5),
    nearMissCredit: clampNumber(r.hours?.nearMissCredit, base.hours.nearMissCredit, 0, 1),
    completenessBonus: clampNumber(r.hours?.completenessBonus, base.hours.completenessBonus, 0, 1),
    timeInTypeTargetHours: Math.round(clampNumber(r.hours?.timeInTypeTargetHours, base.hours.timeInTypeTargetHours, 1, 20000)),
    recencyMinHours12mo: Math.round(clampNumber(r.hours?.recencyMinHours12mo, base.hours.recencyMinHours12mo, 0, 5000))
  };

  const possible = Math.round(clampNumber(r.readiness?.possible, base.readiness.possible, 0, 100));
  const strong = Math.round(clampNumber(r.readiness?.strong, base.readiness.strong, possible, 100));

  const rawCerts = Array.isArray((r as { customCerts?: unknown }).customCerts)
    ? ((r as { customCerts: unknown[] }).customCerts)
    : [];
  const customCerts: CustomCert[] = rawCerts
    .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === "object")
    .map((c, i) => ({
      id: typeof c.id === "string" && c.id ? c.id : `cc${i}`,
      label: (typeof c.label === "string" ? c.label : "").slice(0, 80),
      terms: Array.isArray(c.terms)
        ? c.terms.filter((t): t is string => typeof t === "string" && t.trim().length > 0).map((t) => t.trim().slice(0, 60)).slice(0, 12)
        : [],
      status: normalizeStatus(c.status, "soft")
    }))
    .filter((c) => c.label.length > 0)
    .slice(0, 20);

  return { weights, requirements, hours, readiness: { strong, possible }, customCerts };
}

export function normalizeConfigDoc(raw: unknown): ScoringConfigDoc {
  if (!raw || typeof raw !== "object") return defaultConfigDoc();
  const r = raw as Partial<ScoringConfigDoc>;
  const profiles: Record<string, ScoringProfileConfig> = {};
  if (r.profiles && typeof r.profiles === "object") {
    for (const [key, value] of Object.entries(r.profiles)) {
      profiles[key] = normalizeProfileConfig(value);
    }
  }
  return {
    version: 1,
    default: normalizeProfileConfig(r.default),
    profiles
  };
}

/** Resolve the effective config for a profile, falling back to the doc default. */
export function resolveProfileConfig(doc: ScoringConfigDoc, key: string): ScoringProfileConfig {
  return doc.profiles[key] ?? doc.default;
}
