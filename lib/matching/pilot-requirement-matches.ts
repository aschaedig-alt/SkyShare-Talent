import { prisma } from "@/lib/prisma";
import {
  CATEGORY_LABELS,
  SCORING_CATEGORIES,
  SCORING_REQUIREMENTS,
  SCORING_REQUIREMENT_MAP,
  defaultProfileConfig,
  type CategoryKey,
  type ReqStatus,
  type ScoringProfileConfig,
  type ScoringRequirementDef
} from "@/lib/matching/scoring-config";
import type { MatchFeedbackEntry, RequirementFeedback } from "@/lib/matching/match-feedback";
import type { OverrideTier, TierOverrides } from "@/lib/matching/tier-override";
import { KEEP_ON_POSITION, type PositionSkip, type PositionSkipReason, type RequirementSkips } from "@/lib/matching/position-skip";
import { isScanExclusionReason, type ScanExclusionReason } from "@/lib/candidates/scan-exclusion";
import {
  scanPoolWhere,
  isArchivedCandidateStatus,
  CURRENT_MATCH_LIMIT,
  ARCHIVE_MATCH_LIMIT
} from "@/lib/candidates/scan-pool";
import { resolveFleetPosition, aircraftSharingTypeRating } from "@/lib/fleet/positions";
import { parseStringArray } from "@/lib/json";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

type MatchGate = {
  key: string;
  label: string;
  category: string;
  valueType: string;
  numericValue: number | null;
};

export type MatchRequirement = {
  id: string;
  title: string;
  pilotSeat: string | null;
  aircraftTypesJson: string | null;
  baseCity: string | null;
  baseState: string | null;
  baseAirport: string | null;
  gates: MatchGate[];
};

type CandidateMetricLite = {
  key: string;
  label: string;
  valueNumber: number | null;
  valueText: string | null;
  unit: string | null;
  status: string;
  sourceSnippet: string | null;
};

type CandidateForMatch = {
  id: string;
  displayName: string;
  currentTitle: string | null;
  stage: string | null;
  status?: string | null;
  scanExcludedReason: string | null;
  scanExcludedNote: string | null;
  primaryEmail: string | null;
  tagsJson: string | null;
  foldersJson: string | null;
  notes: Array<{ body: string }>;
  files: Array<{ displayFilename: string; originalFilename: string; extractedText?: string | null }>;
  applications: Array<{ job: { title: string; department: string | null } | null }>;
  metrics: CandidateMetricLite[];
};

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export type FactorSource = "structured" | "profile-text" | "application" | "none";
export type FactorStatus = "met" | "near" | "missing" | "unknown";

export type ScoredFactor = {
  key: string;
  label: string;
  category: CategoryKey;
  categoryLabel: string;
  status: FactorStatus;
  requirementStatus: Exclude<ReqStatus, "none">;
  detail: string;
  source: FactorSource;
  sourceLabel: string;
};

export type SubScore = {
  category: CategoryKey;
  label: string;
  score: number | null; // 0–100, null = not enough data / not applicable
  weight: number;
};

export type ReadinessLabel = "Strong signal" | "Worth a look" | "Needs review";

export type PilotRequirementCandidateMatch = {
  candidateId: string;
  candidateName: string;
  currentTitle: string | null;
  stage: string | null;
  /** Combined fit used for ranking: qualified + bonus (0 when gated). */
  score: number;
  /** Gate score (0-100): how well the candidate clears the role's minimums. 100 = meets all. */
  qualified: number;
  /** Add-only bonus from nice-to-haves (type rating, time in type, etc.). */
  bonus: number;
  /** True when a HARD requirement is confirmed missing — flagged, never auto-rejected. */
  gated: boolean;
  /**
   * True when a HARD requirement has no evidence either way (no hours on file,
   * resume text never extracted). NOT the same as failing it — this is a data
   * gap to go close, and it holds the candidate out of the ranked scan results
   * so unverified records don't crowd out people we can actually assess.
   */
  unverified: boolean;
  /** Which hard requirements are unverified — the cleanup list for this person. */
  unverifiedRequirements: string[];
  readiness: ReadinessLabel;
  /** True when readiness was set by a recruiter's manual move, not the engine. */
  overridden: boolean;
  /** Set when the candidate is held out of scans (null = in the pool). */
  excludedReason: ScanExclusionReason | null;
  excludedNote: string | null;
  /** True for a historical (archived Jazz) record rather than a live pipeline one. */
  fromArchive: boolean;
  /** SIC seat where total time is >= 2x the role minimum — likely wants PIC. */
  overqualified: boolean;
  /**
   * CAPTAIN seat where total time is >= 2x the role minimum. Unlike
   * `overqualified` this never removes anyone — high hours are usually what a
   * captain seat wants. It ranks them last and says why, because on a low-
   * minimum seat (a 1,500-hour single-pilot PC-12) a 5,000-hour pilot is still
   * a flight risk even with every minimum cleared.
   */
  likelyOverqualified: boolean;
  /** Total time as a multiple of the role's minimum, when both are known. */
  overqualifiedRatio: number | null;
  /**
   * Set aside for THIS position only (the candidate stays in the system and in
   * every other position's scan). Either a recruiter's explicit skip or the
   * engine's automatic overqualified catch. Null = competing normally.
   */
  setAsideReason: PositionSkipReason | null;
  /** The stored skip when a recruiter made the call; null when automatic. */
  positionSkip: PositionSkip | null;
  summary: string;
  subScores: SubScore[];
  factors: ScoredFactor[];
  hardGaps: string[];
  minsMet: number;
  minsTotal: number;
  feedback: MatchFeedbackEntry | null;
  // Retained for backward compatibility with any older callers.
  matchedSignals: string[];
  reviewGaps: string[];
};

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------


function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Cap on how much extracted document text one candidate contributes. Resumes
 * run ~3.7k chars but a scanned logbook can hit 20k+; without a ceiling a
 * handful of outliers dominate the cost of a whole-pool scan.
 */
const MAX_DOC_TEXT_PER_FILE = 12000;

function candidateText(candidate: CandidateForMatch) {
  return normalize(
    [
      candidate.displayName,
      candidate.currentTitle,
      candidate.stage,
      candidate.primaryEmail,
      ...parseStringArray(candidate.tagsJson),
      ...parseStringArray(candidate.foldersJson),
      ...candidate.notes.map((note) => note.body),
      ...candidate.files.flatMap((file) => [
        file.displayFilename,
        file.originalFilename,
        // The extracted resume/document text. Archived Jazz records carry no
        // title, tags or structured hours, so without this they were being
        // scored on a filename like "Jane Doe Document.pdf" — i.e. blind.
        (file.extractedText ?? "").slice(0, MAX_DOC_TEXT_PER_FILE)
      ]),
      ...candidate.metrics.map((metric) => metric.valueText ?? "")
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function applicationText(candidate: CandidateForMatch) {
  return normalize(
    candidate.applications
      .flatMap((application) => [application.job?.title, application.job?.department])
      .filter(Boolean)
      .join(" ")
  );
}

const MANUFACTURERS =
  /\b(gulfstream|citation|pilatus|bombardier|cessna|learjet|dassault|falcon|embraer|hawker|beechcraft|king air)\b/g;

/**
 * Glue a short letter prefix onto a following number so "g 200", "g-200" and
 * "g200" all become one token. Both the haystack and the aliases go through
 * this, so model designators compare equal however the source wrote them.
 */
function collapseModelTokens(value: string) {
  return value.replace(/\b([a-z]{1,3})\s+(\d{2,4})\b/g, "$1$2");
}

/**
 * Aliases that identify a SPECIFIC aircraft model.
 *
 * The bare manufacturer ("gulfstream", "citation") is deliberately NOT an alias.
 * It used to be, and it meant a G450/G550 cabin-crew resume matched a G200
 * flight-deck requirement at 60% aircraft fit — the manufacturer is shared by
 * aircraft with different type ratings, so on its own it says nothing about fit.
 */
function aircraftAliases(aircraft: string) {
  const normalized = collapseModelTokens(normalize(aircraft));
  const aliases = new Set<string>();
  if (normalized) aliases.add(normalized);
  // Pull out a compact model token (e.g. "g450", "560xl", "pc12").
  const compact = normalized.replace(MANUFACTURERS, "").trim();
  if (compact) aliases.add(compact);
  return Array.from(aliases).filter((alias) => alias.length >= 2 && !/^(gulfstream|citation|pilatus|bombardier|cessna|learjet|dassault|falcon|embraer|hawker|beechcraft|king air)$/.test(alias));
}

/**
 * Whole-token containment. This used to be a raw `text.includes(token)`, which
 * matched a two-letter seat alias like "fo" inside "for" / "info" / "before" —
 * so EVERY candidate, pilot or not, passed seat fit. Both sides are normalized
 * to lowercase alphanumerics separated by single spaces, so padding with spaces
 * is an exact word-boundary test.
 */
function includesToken(text: string, token: string) {
  const t = collapseModelTokens(normalize(token));
  if (t.length === 0) return false;
  return ` ${collapseModelTokens(text)} `.includes(` ${t} `);
}

const HOURS_TEXT_SYNONYMS: Record<string, string[]> = {
  // No bare "total": it is a common word on any application form and matched
  // whatever number happened to follow it.
  total_time: ["total time", "total flight time", "total hours"],
  pic_time: ["pilot in command", "pic"],
  sic_time: ["second in command", "sic"],
  turbine_time: ["turbine"],
  multi_engine_time: ["multi engine", "multi-engine", "multiengine", "mel"],
  jet_time: ["jet"],
  instrument_time: ["instrument"],
  night_time: ["night"],
  cross_country_time: ["cross country", "cross-country", "xc"]
};

function escapeRe(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * `\b` around the captured number matters more than it looks: without it,
 * "g450" yields 450 and "ce525" yields 525, because the digits inside a model
 * designator are reachable. A word boundary can't fall between "g" and "4", so
 * anchoring the capture rules designators out.
 */
function detectHours(text: string, gateKey: string): number | null {
  const terms = HOURS_TEXT_SYNONYMS[gateKey] ?? [];
  for (const term of terms) {
    const safe = escapeRe(normalize(term));
    if (!safe) continue;
    const after = new RegExp(`\\b${safe}\\b[^0-9]{0,18}\\b(\\d{2,5})\\b`, "i");
    const before = new RegExp(`\\b(\\d{2,5})\\b\\s*(?:hours|hrs|hr)?[^0-9]{0,12}\\b${safe}\\b`, "i");
    const match = text.match(after) ?? text.match(before);
    if (match?.[1]) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n >= 1 && n <= 40000) return n;
    }
  }
  return null;
}

/**
 * Hours in type, e.g. "G450 880 hours".
 *
 * An explicit hours unit is REQUIRED. Without it this read the model number
 * itself as the hour count — "Gulfstream G450" on a cabin-attendant resume was
 * scored as 450 hours in type, which against a 25-hour target is full credit.
 * A number sitting next to an aircraft name is not evidence of time in it.
 */
function detectHoursNearAircraft(text: string, aliases: string[]): number | null {
  const haystack = collapseModelTokens(text);
  for (const alias of aliases) {
    const safe = escapeRe(collapseModelTokens(normalize(alias)));
    if (!safe) continue;
    const after = new RegExp(`\\b${safe}\\b[^0-9]{0,18}\\b(\\d{2,5})\\b\\s*(?:hours|hrs|hr)\\b`, "i");
    const before = new RegExp(`\\b(\\d{2,5})\\b\\s*(?:hours|hrs|hr)\\b[^0-9]{0,12}\\b${safe}\\b`, "i");
    const match = haystack.match(after) ?? haystack.match(before);
    if (match?.[1]) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n >= 1 && n <= 40000) return n;
    }
  }
  return null;
}

function sourceLabelFor(source: FactorSource): string {
  switch (source) {
    case "structured":
      return "saved profile data";
    case "profile-text":
      return "resume / notes";
    case "application":
      return "application history";
    default:
      return "not found";
  }
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function statusWeight(status: Exclude<ReqStatus, "none">): number {
  return status === "hard" ? 2 : 1;
}

function creditForStatus(status: FactorStatus, nearMissCredit: number): number {
  if (status === "met") return 1;
  if (status === "near") return nearMissCredit;
  return 0; // missing or unknown
}

type WorkingFactor = ScoredFactor & { credit: number; evaluated: boolean };

export function scoreCandidate(
  requirement: MatchRequirement,
  candidate: CandidateForMatch,
  config: ScoringProfileConfig,
  feedback: MatchFeedbackEntry | null,
  override: OverrideTier | null = null,
  skip: PositionSkip | null = null
): PilotRequirementCandidateMatch {
  const text = candidateText(candidate);
  const appliedText = applicationText(candidate);
  const aircraftList = parseStringArray(requirement.aircraftTypesJson);
  const allAircraftAliases = aircraftList.flatMap(aircraftAliases);

  // Type-rating-aware aircraft fit: a candidate who holds the role's type rating
  // — or has flown any aircraft that shares it (e.g. CE-525 covers M2/CJ/CJ2) —
  // counts as type-rated, even if they haven't flown this exact model.
  const fleetPosition = resolveFleetPosition(requirement.title);
  const positionTypeRating = fleetPosition?.typeRating || null;
  const typeRatingAliases = positionTypeRating
    ? [
        normalize(positionTypeRating),
        normalize(positionTypeRating).replace(/\s+/g, ""),
        ...aircraftSharingTypeRating(positionTypeRating).flatMap(aircraftAliases)
      ].filter((alias) => alias.length >= 2)
    : [];
  const ratingAliases = [...new Set([...allAircraftAliases, ...typeRatingAliases])];

  const metricsByKey = new Map(candidate.metrics.map((metric) => [metric.key, metric]));
  const gatesByKey = new Map(requirement.gates.map((gate) => [gate.key, gate]));

  const factors: WorkingFactor[] = [];
  const perCategory: Record<CategoryKey, WorkingFactor[]> = {
    aircraft: [],
    seat: [],
    hourMins: [],
    timeInType: [],
    recency: [],
    certs: []
  };

  const pushFactor = (factor: WorkingFactor) => {
    factors.push(factor);
    perCategory[factor.category].push(factor);
  };

  const reqStatus = (def: ScoringRequirementDef): ReqStatus =>
    config.requirements[def.key] ?? def.defaultStatus;

  // --- Aircraft fit (type rating) ------------------------------------------
  const typeRatingDef = SCORING_REQUIREMENTS.find((req) => req.key === "type_rating")!;
  if (reqStatus(typeRatingDef) !== "none" && aircraftList.length > 0) {
    const ratingsMetric = metricsByKey.get("type_ratings");
    const ratingsText = normalize(ratingsMetric?.valueText ?? "");
    const inRatings = ratingAliases.some((alias) => includesToken(ratingsText, alias));
    const inProfile = ratingAliases.some((alias) => includesToken(text, alias));
    const inApplied = ratingAliases.some((alias) => includesToken(appliedText, alias));

    let status: FactorStatus;
    let source: FactorSource;
    if (inRatings) {
      status = "met";
      source = "structured";
    } else if (inProfile) {
      status = "near";
      source = "profile-text";
    } else if (inApplied) {
      status = "near";
      source = "application";
    } else {
      status = "missing";
      source = "none";
    }

    pushFactor({
      key: "type_rating",
      label: positionTypeRating ? `Type rating — ${positionTypeRating}` : `Type rating — ${aircraftList[0]}`,
      category: "aircraft",
      categoryLabel: CATEGORY_LABELS.aircraft,
      status,
      requirementStatus: reqStatus(typeRatingDef) === "hard" ? "hard" : "soft",
      detail:
        status === "met"
          ? positionTypeRating
            ? `${positionTypeRating} type rating on file (covers ${aircraftSharingTypeRating(positionTypeRating).join(" / ") || aircraftList[0]})`
            : "Type rating on file"
          : status === "near"
            ? `Aircraft referenced (${source === "application" ? "in applications" : "in profile"})`
            : "No aircraft evidence",
      source,
      sourceLabel: sourceLabelFor(source),
      credit: status === "met" ? 1 : status === "near" ? 0.6 : 0,
      evaluated: true
    });
  }

  // --- Seat fit ------------------------------------------------------------
  const seat = normalize(requirement.pilotSeat);
  // Overqualified: an SIC (first-officer) seat where the candidate already has
  // >= 2x the role's total-time minimum is likely a captain who won't be happy
  // in the right seat — that LOWERS seat fit (a caution, never a hard gate).
  // PIC seats are never penalized for more hours.
  const totalTimeMin = gatesByKey.get("total_time")?.numericValue ?? null;
  const totalTimeValue = metricsByKey.get("total_time")?.valueNumber ?? null;
  //
  // The same 2x test now runs on BOTH seats, because the consequence differs
  // rather than the measurement. On an SIC seat it sets the candidate aside:
  // a captain-level pilot in the right seat is a retention risk. On a PIC seat
  // it does NOT — high hours are usually what you want in a captain — but it is
  // still worth knowing, because a 5,000-hour pilot against a 1,500-hour
  // single-pilot PC-12 seat is a flight risk even though every minimum is
  // cleared. That case was being handled by hand: the PC-12 Captain position
  // already carries ten manual OVERQUALIFIED skips, every one of them made by a
  // recruiter rather than the engine.
  const overqualifiedRatio =
    typeof totalTimeMin === "number" && totalTimeMin > 0 && typeof totalTimeValue === "number"
      ? totalTimeValue / totalTimeMin
      : null;
  const atLeastDoubleTheMinimum = overqualifiedRatio !== null && overqualifiedRatio >= 2;

  // "Lead PIC" is a captain seat too, so match on the seat containing "pic"
  // rather than equalling it; "sic" never contains "pic".
  const isCaptainSeat = seat.includes("pic");

  /** SIC only — this is the one that removes them from the ranked list. */
  const overqualified = seat === "sic" && atLeastDoubleTheMinimum;
  /** PIC only — a flag and a sort, never a removal. */
  const likelyOverqualified = isCaptainSeat && atLeastDoubleTheMinimum;
  if (seat) {
    // No bare "fo" — as a substring it lived inside "for", "info" and "before",
    // so every candidate cleared seat fit. "f o" is what a normalized "F/O"
    // becomes, and it only matches as a whole token now.
    const seatAliases =
      seat === "pic"
        ? ["pic", "pilot in command", "captain"]
        : seat === "sic"
          ? ["sic", "second in command", "first officer", "f o"]
          : [seat];
    const seatMetric = seat === "pic" ? metricsByKey.get("pic") : seat === "sic" ? metricsByKey.get("sic") : undefined;
    const hasSeatHours = typeof seatMetric?.valueNumber === "number" && seatMetric.valueNumber > 0;
    const inProfile = seatAliases.some((alias) => includesToken(text, alias));
    const inApplied = seatAliases.some((alias) => includesToken(appliedText, alias));

    let status: FactorStatus;
    let source: FactorSource;
    if (hasSeatHours) {
      status = "met";
      source = "structured";
    } else if (inProfile) {
      // Naming the seat on a resume is weaker than logged hours in it, so it
      // reads as "near" — it used to be full credit, indistinguishable from a
      // pilot with the hours actually on file.
      status = "near";
      source = "profile-text";
    } else if (inApplied) {
      status = "near";
      source = "application";
    } else {
      status = "missing";
      source = "none";
    }

    let credit = source === "structured" ? 1 : source === "profile-text" ? 0.6 : source === "application" ? 0.4 : 0;
    let seatDetail =
      source === "structured"
        ? `${(seatMetric?.valueNumber ?? 0).toLocaleString()} ${seat.toUpperCase()} hrs on file`
        : source === "profile-text"
          ? `${requirement.pilotSeat} referenced in resume / notes (no seat hours on file)`
          : source === "application"
            ? "Seat referenced in applications"
            : `No clear ${requirement.pilotSeat} evidence`;

    // Overqualified caps seat fit: a captain-level pilot in an SIC seat is a
    // weaker seat match (retention/flight risk), even with the hours on file.
    if (overqualified && credit > 0.35) {
      status = "near";
      credit = 0.35;
      seatDetail = `${(totalTimeValue ?? 0).toLocaleString()} total hrs — ~2x the ${(totalTimeMin ?? 0).toLocaleString()} min; likely wants a PIC seat`;
    }

    pushFactor({
      key: "seat",
      label: `Seat — ${requirement.pilotSeat}`,
      category: "seat",
      categoryLabel: CATEGORY_LABELS.seat,
      status,
      requirementStatus: "soft",
      detail: seatDetail,
      source,
      sourceLabel: sourceLabelFor(source),
      credit,
      evaluated: true
    });
  }

  // --- Hour minimums -------------------------------------------------------
  const hourDefs = SCORING_REQUIREMENTS.filter((req) => req.kind === "hours");
  let minsMet = 0;
  let minsTotal = 0;
  let anyHourUnknown = false;
  for (const def of hourDefs) {
    const status = reqStatus(def);
    if (status === "none") continue;
    const gate = def.gateKey ? gatesByKey.get(def.gateKey) : undefined;
    const min = gate?.numericValue ?? null;
    if (typeof min !== "number" || min <= 0) continue; // role doesn't set this minimum

    minsTotal += 1;

    const metric = def.metricKey ? metricsByKey.get(def.metricKey) : undefined;
    let value: number | null = typeof metric?.valueNumber === "number" ? metric.valueNumber : null;
    let source: FactorSource = value !== null ? "structured" : "none";
    if (value === null) {
      const fromText = detectHours(text, def.gateKey ?? def.key);
      if (fromText !== null) {
        value = fromText;
        source = "profile-text";
      }
    }

    let fStatus: FactorStatus;
    if (value === null) {
      fStatus = "unknown";
      anyHourUnknown = true;
    } else if (value >= min) {
      fStatus = "met";
      minsMet += 1;
    } else if (value >= min * (1 - config.hours.nearMissTolerancePct)) {
      fStatus = "near";
    } else {
      fStatus = "missing";
    }

    pushFactor({
      key: def.key,
      label: def.label,
      category: "hourMins",
      categoryLabel: CATEGORY_LABELS.hourMins,
      status: fStatus,
      requirementStatus: status === "hard" ? "hard" : "soft",
      detail:
        value === null
          ? `min ${min.toLocaleString()} · hours not found`
          : `${value.toLocaleString()} hrs · min ${min.toLocaleString()}`,
      source,
      sourceLabel: sourceLabelFor(source),
      credit: creditForStatus(fStatus, config.hours.nearMissCredit),
      evaluated: fStatus !== "unknown"
    });
  }

  // --- Time in type ("more is better") -------------------------------------
  const titDef = SCORING_REQUIREMENTS.find((req) => req.key === "time_in_type")!;
  if (reqStatus(titDef) !== "none" && aircraftList.length > 0) {
    const hrs = detectHoursNearAircraft(text, allAircraftAliases);
    let fStatus: FactorStatus;
    let credit: number;
    let detail: string;
    let source: FactorSource;
    if (hrs === null) {
      fStatus = "unknown";
      credit = 0;
      detail = "Hours in type not found";
      source = "none";
    } else {
      const ratio = Math.min(hrs / config.hours.timeInTypeTargetHours, 1);
      credit = ratio;
      fStatus = ratio >= 0.999 ? "met" : ratio >= 0.4 ? "near" : "missing";
      detail = `${hrs.toLocaleString()} hrs in type · more is better`;
      source = "profile-text";
    }
    pushFactor({
      key: "time_in_type",
      label: `Time in type — ${aircraftList[0]}`,
      category: "timeInType",
      categoryLabel: CATEGORY_LABELS.timeInType,
      status: fStatus,
      requirementStatus: reqStatus(titDef) === "hard" ? "hard" : "soft",
      detail,
      source,
      sourceLabel: sourceLabelFor(source),
      credit,
      evaluated: fStatus !== "unknown"
    });
  }

  // --- Recency / currency --------------------------------------------------
  // Primary signal: the candidate's "hours flown in the last 12 months" metric
  // (recency_12mo) vs the configurable currency threshold. Falls back to a weak
  // resume-keyword hint when no hours are on file.
  {
    const recencyMetric = metricsByKey.get("recency_12mo");
    const recencyHours = typeof recencyMetric?.valueNumber === "number" ? recencyMetric.valueNumber : null;
    const minHrs = config.hours.recencyMinHours12mo;
    let status: FactorStatus;
    let credit: number;
    let detail: string;
    let source: FactorSource;
    if (recencyHours !== null) {
      source = "structured";
      if (minHrs <= 0 || recencyHours >= minHrs) {
        status = "met";
        credit = 1;
        detail = `${recencyHours.toLocaleString()} hrs in last 12 mo — current`;
      } else if (recencyHours >= minHrs * 0.5) {
        status = "near";
        credit = 0.5;
        detail = `${recencyHours.toLocaleString()} hrs in last 12 mo — below ${minHrs.toLocaleString()}-hr current threshold`;
      } else {
        status = "missing";
        credit = 0;
        detail = `${recencyHours.toLocaleString()} hrs in last 12 mo — not current (min ${minHrs.toLocaleString()})`;
      }
    } else {
      const recencyHit = /\b(202[3-9]|current|recurrent|type current|recent)\b/.test(text);
      status = recencyHit ? "near" : "unknown";
      credit = recencyHit ? 0.5 : 0;
      detail = recencyHit ? "Recent activity referenced (no 12-mo hours on file)" : "No recency data on file";
      source = recencyHit ? "profile-text" : "none";
    }
    pushFactor({
      key: "recency",
      label: "Recency / currency",
      category: "recency",
      categoryLabel: CATEGORY_LABELS.recency,
      status,
      requirementStatus: "soft",
      detail,
      source,
      sourceLabel: sourceLabelFor(source),
      credit,
      evaluated: status !== "unknown"
    });
  }

  // --- Certs & ratings -----------------------------------------------------
  const certDefs = SCORING_REQUIREMENTS.filter((req) => req.kind === "cert");
  for (const def of certDefs) {
    const status = reqStatus(def);
    if (status === "none") continue;

    const certsMetric = metricsByKey.get("certificates");
    const certsText = normalize(certsMetric?.valueText ?? "");
    let fStatus: FactorStatus = "unknown";
    let source: FactorSource = "none";
    let detail = "Not found on file";

    if (def.key === "atp_certificate") {
      // A pilot needs EITHER a Commercial certificate OR an ATP — credit either.
      if (certsText.includes("atp") || certsText.includes("commercial") || certsText.includes("cpl")) {
        fStatus = "met";
        source = "structured";
        detail = certsText.includes("atp") ? "ATP on file" : "Commercial certificate on file";
      } else if (/\b(atp|airline transport|commercial pilot|commercial|cpl)\b/.test(text)) {
        fStatus = "met";
        source = "profile-text";
        detail = /\b(atp|airline transport)\b/.test(text) ? "ATP referenced" : "Commercial certificate referenced";
      }
    } else if (def.key === "medical_class") {
      const med = metricsByKey.get("medical_class");
      if (med?.valueText) {
        fStatus = "met";
        source = "structured";
        detail = med.valueText;
      } else if (/\b(first|second|third)[\s-]*class\b/.test(text)) {
        fStatus = "met";
        source = "profile-text";
        detail = "Medical referenced";
      }
    } else if (def.key === "current_ifr") {
      const instr = metricsByKey.get("instrument");
      if (typeof instr?.valueNumber === "number" && instr.valueNumber > 0) {
        fStatus = "met";
        source = "structured";
        detail = "Instrument time on file";
      } else if (/\b(ifr|instrument)\b/.test(text)) {
        fStatus = "met";
        source = "profile-text";
        detail = "Instrument experience referenced";
      }
    }

    pushFactor({
      key: def.key,
      label: def.label,
      category: "certs",
      categoryLabel: CATEGORY_LABELS.certs,
      status: fStatus,
      requirementStatus: status === "hard" ? "hard" : "soft",
      detail,
      source,
      sourceLabel: sourceLabelFor(source),
      credit: fStatus === "met" ? 1 : 0,
      evaluated: fStatus !== "unknown"
    });
  }

  // --- Custom certs/ratings (recruiter-defined) ----------------------------
  // Each is an either/or group: credited if ANY listed term appears in the
  // candidate's certificates or profile text.
  {
    const certsText = normalize(metricsByKey.get("certificates")?.valueText ?? "");
    for (const cc of config.customCerts ?? []) {
      if (cc.status === "none" || !cc.label.trim()) continue;
      const terms = cc.terms.map((t) => normalize(t)).filter(Boolean);
      const hit = terms.length > 0 && terms.some((t) => certsText.includes(t) || text.includes(t));
      pushFactor({
        key: `custom_cert_${cc.id}`,
        label: cc.label,
        category: "certs",
        categoryLabel: CATEGORY_LABELS.certs,
        status: hit ? "met" : "unknown",
        requirementStatus: cc.status,
        detail: hit ? "On file / referenced" : `Not found${cc.terms.length ? ` (any of: ${cc.terms.join(", ")})` : ""}`,
        source: hit ? "profile-text" : "none",
        sourceLabel: sourceLabelFor(hit ? "profile-text" : "none"),
        credit: hit ? 1 : 0,
        evaluated: hit
      });
    }
  }

  // --- Roll category sub-scores --------------------------------------------
  const subScores: SubScore[] = [];
  for (const category of SCORING_CATEGORIES) {
    // Every factor the role actually asks for, INCLUDING the ones we have no
    // data on. Unknowns used to be filtered out here, which collapsed a
    // category to null and dropped its weight from the roll-up below — so "no
    // hours on file" scored identically to "hours don't matter". A category is
    // null only when the role sets nothing in it (genuinely not applicable).
    const catFactors = perCategory[category];
    const weight = config.weights[category];

    if (catFactors.length === 0) {
      subScores.push({ category, label: CATEGORY_LABELS[category], score: null, weight });
      continue;
    }

    let score: number;
    if (category === "timeInType" || category === "recency") {
      // Single best-effort signal — use its credit directly.
      const best = Math.max(...catFactors.map((factor) => factor.credit));
      score = Math.round(best * 100);
    } else {
      const totalWeight = catFactors.reduce((sum, factor) => sum + statusWeight(factor.requirementStatus), 0);
      const earned = catFactors.reduce((sum, factor) => sum + statusWeight(factor.requirementStatus) * factor.credit, 0);
      score = totalWeight > 0 ? Math.round((earned / totalWeight) * 100) : 0;
      // Hour-minimums completeness bonus: all known minimums met, none unknown.
      if (category === "hourMins" && minsTotal > 0 && minsMet === minsTotal && !anyHourUnknown) {
        score = Math.min(100, Math.round(score + config.hours.completenessBonus * 100));
      }
    }
    subScores.push({ category, label: CATEGORY_LABELS[category], score, weight });
  }

  // --- Overall roll-up (weighted over categories that have data) -----------
  const scored = subScores.filter((sub) => sub.score !== null) as Array<SubScore & { score: number }>;
  const weightSum = scored.reduce((sum, sub) => sum + sub.weight, 0);
  const overall = weightSum > 0 ? Math.round(scored.reduce((sum, sub) => sum + sub.weight * sub.score, 0) / weightSum) : 0;

  // --- Hard gaps (confirmed missing hard requirements) -> gates the candidate
  const hardGaps = factors
    .filter((factor) => factor.requirementStatus === "hard" && factor.status === "missing")
    .map((factor) => factor.label);
  const gated = hardGaps.length > 0;

  // --- Qualified (gate) + Bonus (add-only) split ---------------------------
  //
  // Two rules here were wrong and produced 100%-qualified non-pilots:
  //
  //  1. Unknown factors were FILTERED OUT of the gate. A candidate with no
  //     hours on file had nothing left to fail, so the few things that did
  //     resolve carried the whole score — and when nothing resolved at all the
  //     fallback handed out a flat 100. Missing evidence is now worth zero and
  //     still counts in the denominator: you do not clear a minimum by having
  //     no data about it. Candidates in that position are reported as
  //     `unverified` so they read as "we don't know yet", not as "qualified".
  //
  //  2. The gate ignored config.weights entirely and used a flat hard=2/soft=1
  //     per factor. Setting hour minimums to 80% of the profile changed nothing
  //     on screen. Qualified is now the weighted average ACROSS CATEGORIES
  //     using the configured weights, with hard/soft weighting applied inside
  //     each category.
  const effStatus = (key: string): ReqStatus => {
    const def = SCORING_REQUIREMENT_MAP[key];
    return def ? config.requirements[def.key] ?? def.defaultStatus : "soft";
  };
  const customCertStatus = new Map((config.customCerts ?? []).map((c) => [`custom_cert_${c.id}`, c.status]));
  // Bonus is now EXACTLY what the recruiter marked "bonus" — nothing else.
  // time-in-type and recency used to be hardcoded as bonus regardless of how
  // they were configured, which is where a cabin attendant's +42 came from.
  const isBonusFactor = (factor: WorkingFactor): boolean =>
    (customCertStatus.get(factor.key) ?? effStatus(factor.key)) === "bonus";

  const gateCategoryScore = (category: CategoryKey): number | null => {
    const catFactors = perCategory[category].filter((factor) => !isBonusFactor(factor));
    if (catFactors.length === 0) return null; // role doesn't ask for this at all
    const totalWeight = catFactors.reduce((sum, factor) => sum + statusWeight(factor.requirementStatus), 0);
    if (totalWeight === 0) return null;
    // Unknown contributes 0 credit but still occupies its share of the weight.
    const earned = catFactors.reduce((sum, factor) => sum + statusWeight(factor.requirementStatus) * factor.credit, 0);
    return (earned / totalWeight) * 100;
  };

  let gateWeightSum = 0;
  let gateScoreSum = 0;
  for (const category of SCORING_CATEGORIES) {
    const weight = config.weights[category];
    if (weight <= 0) continue;
    const score = gateCategoryScore(category);
    if (score === null) continue;
    gateWeightSum += weight;
    gateScoreSum += weight * score;
  }
  const qualified = gateWeightSum > 0 ? Math.round(gateScoreSum / gateWeightSum) : 0;

  const BONUS_PER_FACTOR = 20;
  const BONUS_CAP = 50;
  const bonus = Math.round(
    Math.min(
      BONUS_CAP,
      factors.filter(isBonusFactor).reduce((sum, factor) => sum + Math.max(0, factor.credit) * BONUS_PER_FACTOR, 0)
    )
  );

  // --- Unverified: a HARD requirement we have no evidence either way on -----
  // Distinct from `gated` (a hard requirement confirmed NOT met). "No hours on
  // file" and "not enough hours" are different problems: the first is a data
  // gap to go fix, the second is a real disqualification.
  const unverifiedRequirements = factors
    .filter((factor) => factor.requirementStatus === "hard" && factor.status === "unknown")
    .map((factor) => factor.label);
  const unverified = unverifiedRequirements.length > 0;

  const total = gated ? 0 : qualified + bonus;

  // Readiness reads off the qualified (gate) score; a hard-requirement gate caps
  // it, and so does an unverified one — nobody is a "strong signal" on evidence
  // we don't have.
  let readiness: ReadinessLabel = gated || unverified
    ? "Needs review"
    : qualified >= config.readiness.strong
      ? "Strong signal"
      : qualified >= config.readiness.possible
        ? "Worth a look"
        : "Needs review";

  // A recruiter's manual move wins over the computed tier and sticks.
  const overridden = override !== null && override !== readiness;
  if (override !== null) {
    readiness = override;
  }

  // `overqualified` is computed up in the seat-fit block (it also lowers seat fit).
  //
  // Set-aside: a recruiter's explicit skip wins over the engine's guess, so an
  // overqualified pilot deliberately restored to the list stays there. The
  // automatic catch is SIC-only by design — a captain with twice the minimum is
  // simply an experienced captain, and setting those aside would bury the best
  // candidates for every PIC opening.
  const setAsideReason: PositionSkipReason | null =
    skip?.reason === KEEP_ON_POSITION
      ? null
      : skip
        ? (skip.reason as PositionSkipReason)
        : overqualified
          ? "OVERQUALIFIED"
          : null;

  const summary = buildSummary(factors, minsMet, minsTotal, hardGaps, overall);

  // Backward-compatible flat signal/gap lists.
  const matchedSignals = factors
    .filter((factor) => factor.status === "met")
    .slice(0, 6)
    .map((factor) => `${factor.label}: ${factor.detail}`);
  const reviewGaps = factors
    .filter((factor) => factor.status === "missing" || factor.status === "near")
    .slice(0, 6)
    .map((factor) => `${factor.label}: ${factor.detail}`);

  const cleanFactors: ScoredFactor[] = factors.map((factor) => ({
    key: factor.key,
    label: factor.label,
    category: factor.category,
    categoryLabel: factor.categoryLabel,
    status: factor.status,
    requirementStatus: factor.requirementStatus,
    detail: factor.detail,
    source: factor.source,
    sourceLabel: factor.sourceLabel
  }));

  return {
    candidateId: candidate.id,
    candidateName: candidate.displayName,
    currentTitle: candidate.currentTitle,
    stage: candidate.stage,
    score: total,
    qualified,
    bonus,
    gated,
    unverified,
    unverifiedRequirements,
    readiness,
    overridden,
    excludedReason: isScanExclusionReason(candidate.scanExcludedReason) ? candidate.scanExcludedReason : null,
    excludedNote: candidate.scanExcludedNote,
    fromArchive: isArchivedCandidateStatus(candidate.status),
    overqualified,
    likelyOverqualified,
    overqualifiedRatio: overqualifiedRatio === null ? null : Math.round(overqualifiedRatio * 10) / 10,
    setAsideReason,
    positionSkip: skip,
    summary,
    subScores,
    factors: cleanFactors,
    hardGaps,
    minsMet,
    minsTotal,
    feedback,
    matchedSignals,
    reviewGaps
  };
}

function buildSummary(
  factors: WorkingFactor[],
  minsMet: number,
  minsTotal: number,
  hardGaps: string[],
  overall: number
): string {
  if (factors.every((factor) => factor.status === "unknown")) {
    return "Not enough profile data to assess yet — add resume text or structured hours.";
  }

  const positives: string[] = [];
  if (minsTotal > 0 && minsMet === minsTotal) {
    positives.push("meets all hour minimums");
  } else if (minsTotal > 0 && minsMet > 0) {
    positives.push(`meets ${minsMet} of ${minsTotal} hour minimums`);
  }
  const typeRating = factors.find((factor) => factor.key === "type_rating");
  if (typeRating?.status === "met") positives.push("type rating on file");
  const seat = factors.find((factor) => factor.key === "seat");
  if (seat?.status === "met") positives.push("seat experience");

  const nearMiss = factors.find((factor) => factor.category === "hourMins" && factor.status === "near");
  const gapBits: string[] = [];
  if (hardGaps.length > 0) gapBits.push(`missing ${hardGaps[0].toLowerCase()}`);
  else if (nearMiss) gapBits.push(`close on ${nearMiss.label.toLowerCase()} (${nearMiss.detail})`);

  const lead = positives.length > 0 ? positives.slice(0, 2).join(", ") : overall > 0 ? "some matching signal" : "limited matching signal";
  const sentence = gapBits.length > 0 ? `${lead}; ${gapBits[0]}.` : `${lead}.`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export const candidateMatchSelect = {
  id: true,
  displayName: true,
  currentTitle: true,
  stage: true,
  status: true,
  scanExcludedReason: true,
  scanExcludedNote: true,
  primaryEmail: true,
  tagsJson: true,
  foldersJson: true,
  notes: { select: { body: true }, take: 10 },
  files: { select: { displayFilename: true, originalFilename: true, extractedText: true }, take: 10 },
  applications: { take: 10, select: { job: { select: { title: true, department: true } } } },
  metrics: {
    select: { key: true, label: true, valueNumber: true, valueText: true, unit: true, status: true, sourceSnippet: true }
  }
} as const;

/** How many set-aside candidates to carry back for the collapsed group. */
export const SET_ASIDE_LIMIT = 60;

/** How many likely-overqualified captains to carry back for their group. */
export const LIKELY_OVERQUALIFIED_LIMIT = 40;

export type RequirementScanResult = {
  /** The ranked board. */
  ranked: PilotRequirementCandidateMatch[];
  /**
   * Captain seats where total time is 2x+ the minimum. Their OWN list with its
   * own budget, not merely sorted last: sorting them to the bottom of `ranked`
   * put them past the CURRENT_MATCH_LIMIT slice, so the group came back empty
   * every time. They are candidates, just not ahead of people who fit the seat.
   */
  likelyOverqualified: PilotRequirementCandidateMatch[];
  /**
   * Held out of the ranked board for THIS position only — a recruiter's skip or
   * the automatic overqualified catch. Returned rather than dropped so a wrong
   * call stays visible and reversible.
   */
  setAside: PilotRequirementCandidateMatch[];
};

/**
 * The whole-pool scan, ranked list and set-aside group in one pass.
 *
 * Prefer this over `getPilotRequirementCandidateMatches` when you need both —
 * scoring the pool is the expensive part (~1.4s of query and ~1.3s of scoring
 * for 3,343 people), so calling twice to get the two halves doubles it.
 */
export async function scanRequirementPool(
  requirement: MatchRequirement | null,
  config: ScoringProfileConfig = defaultProfileConfig(),
  feedback: RequirementFeedback = {},
  overrides: TierOverrides = {},
  skips: RequirementSkips = {},
  includeExcluded = false
): Promise<RequirementScanResult> {
  if (!requirement) return { ranked: [], likelyOverqualified: [], setAside: [] };

  // No `take` here on purpose. The old 250-row cap ordered by updatedAt meant a
  // scan silently saw only the most recently touched slice of the pool; with the
  // archive included that would have hidden almost all of it.
  const candidates = await prisma.candidate.findMany({
    where: scanPoolWhere(includeExcluded),
    select: candidateMatchSelect
  });

  const scored = candidates
    .map((candidate) =>
      scoreCandidate(
        requirement,
        candidate,
        config,
        feedback[candidate.id] ?? null,
        overrides[candidate.id] ?? null,
        skips[candidate.id] ?? null
      )
    )
    // Unverified records are held out of the ranked scan: with only 32 of 341
    // live candidates carrying structured hours, leaving them in means the
    // board is mostly people we cannot assess. They are not lost — they are
    // listed by `getUnverifiedForRequirement` as a data-cleanup queue, and a
    // recruiter's manual tier override still forces one back onto the board.
    .filter((match) => match.overridden || (!match.unverified && (match.score > 0 || match.factors.some((factor) => factor.status === "met"))))
    .sort(compareMatches);

  // Set aside BEFORE the budget slice, so a skipped candidate never occupies a
  // slot that a competing one should have had.
  const setAside = scored.filter((match) => match.setAsideReason !== null);
  const remaining = scored.filter((match) => match.setAsideReason === null);
  // Partitioned rather than sorted last, for the reason on the type above.
  const overqualifiedCaptains = remaining.filter((match) => match.likelyOverqualified);
  const ranked = remaining.filter((match) => !match.likelyOverqualified);

  // Two budgets, not one list. Archived candidates out-rank live ones often
  // enough (10 of the top 12 on a real G450 scan) that a single merged cut
  // pushed the working pipeline off the board entirely.
  return {
    ranked: [
      ...ranked.filter((match) => !match.fromArchive).slice(0, CURRENT_MATCH_LIMIT),
      ...ranked.filter((match) => match.fromArchive).slice(0, ARCHIVE_MATCH_LIMIT)
    ],
    likelyOverqualified: overqualifiedCaptains.slice(0, LIKELY_OVERQUALIFIED_LIMIT),
    setAside: setAside.slice(0, SET_ASIDE_LIMIT)
  };
}

/** The ranked board only. Thin wrapper over `scanRequirementPool`. */
export async function getPilotRequirementCandidateMatches(
  requirement: MatchRequirement | null,
  config: ScoringProfileConfig = defaultProfileConfig(),
  feedback: RequirementFeedback = {},
  overrides: TierOverrides = {},
  includeExcluded = false,
  skips: RequirementSkips = {}
): Promise<PilotRequirementCandidateMatch[]> {
  const { ranked } = await scanRequirementPool(requirement, config, feedback, overrides, skips, includeExcluded);
  return ranked;
}

export type UnverifiedCandidate = {
  candidateId: string;
  candidateName: string;
  currentTitle: string | null;
  stage: string | null;
  fromArchive: boolean;
  /** Hard requirements with no evidence either way. */
  missingData: string[];
  /** True when we hold no extracted document text at all — the usual root cause. */
  noDocumentText: boolean;
};

/**
 * The data-cleanup queue behind the `unverified` flag: everyone the scan had to
 * hold back because a hard requirement has no evidence either way. Ordered by
 * fewest gaps first, so the quickest wins are at the top.
 */
export async function getUnverifiedForRequirement(
  requirement: MatchRequirement | null,
  config: ScoringProfileConfig = defaultProfileConfig(),
  includeExcluded = false
): Promise<UnverifiedCandidate[]> {
  if (!requirement) return [];

  const candidates = await prisma.candidate.findMany({
    where: scanPoolWhere(includeExcluded),
    select: candidateMatchSelect
  });

  return candidates
    .map((candidate) => ({ candidate, match: scoreCandidate(requirement, candidate, config, null, null) }))
    .filter((row) => row.match.unverified)
    .map(({ candidate, match }) => ({
      candidateId: match.candidateId,
      candidateName: match.candidateName,
      currentTitle: match.currentTitle,
      stage: match.stage,
      fromArchive: match.fromArchive,
      missingData: match.unverifiedRequirements,
      noDocumentText: candidate.files.every((file) => (file.extractedText ?? "").trim().length === 0)
    }))
    .sort(
      (left, right) =>
        left.missingData.length - right.missingData.length ||
        left.candidateName.localeCompare(right.candidateName)
    );
}

/**
 * Ranking order. Score first, but at pool scale scores tie in large blocks —
 * 107 people shared the 12th-place score on a real G450 scan, and 434 on a
 * Phenom 300 one. Falling straight through to alphabetical made the cut an
 * arbitrary A-names sample, so ties break on STRENGTH OF EVIDENCE: who clears
 * more of the role's hour minimums, then who has more of the role's factors
 * actually established either way rather than unknown. Both are properties of
 * the match itself; nothing here looks at the person.
 */
function compareMatches(left: PilotRequirementCandidateMatch, right: PilotRequirementCandidateMatch) {
  if (right.score !== left.score) return right.score - left.score;
  if (right.minsMet !== left.minsMet) return right.minsMet - left.minsMet;
  const known = (match: PilotRequirementCandidateMatch) =>
    match.factors.filter((factor) => factor.status !== "unknown").length;
  const knownDelta = known(right) - known(left);
  if (knownDelta !== 0) return knownDelta;
  return left.candidateName.localeCompare(right.candidateName);
}

/**
 * Score a specific set of candidates (e.g. the people who applied to a job)
 * against a requirement. Unlike the system-wide scan this keeps EVERY candidate
 * in the set — even weak/zero scores — so an applicant list stays complete.
 */
export async function scoreSpecificCandidates(
  requirement: MatchRequirement,
  candidateIds: string[],
  config: ScoringProfileConfig = defaultProfileConfig(),
  feedback: RequirementFeedback = {},
  overrides: TierOverrides = {},
  skips: RequirementSkips = {}
): Promise<PilotRequirementCandidateMatch[]> {
  if (candidateIds.length === 0) return [];

  const candidates = await prisma.candidate.findMany({
    where: { id: { in: candidateIds } },
    select: candidateMatchSelect
  });

  // Applicants are never dropped — someone who actually applied stays on the
  // list even when set aside; the card shows the reason instead.
  return candidates
    .map((candidate) =>
      scoreCandidate(
        requirement,
        candidate,
        config,
        feedback[candidate.id] ?? null,
        overrides[candidate.id] ?? null,
        skips[candidate.id] ?? null
      )
    )
    .sort((left, right) => right.score - left.score || left.candidateName.localeCompare(right.candidateName));
}
