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
import { isScanExclusionReason, type ScanExclusionReason } from "@/lib/candidates/scan-exclusion";

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
  scanExcludedReason: string | null;
  scanExcludedNote: string | null;
  primaryEmail: string | null;
  tagsJson: string | null;
  foldersJson: string | null;
  notes: Array<{ body: string }>;
  files: Array<{ displayFilename: string; originalFilename: string }>;
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
  readiness: ReadinessLabel;
  /** True when readiness was set by a recruiter's manual move, not the engine. */
  overridden: boolean;
  /** Set when the candidate is held out of scans (null = in the pool). */
  excludedReason: ScanExclusionReason | null;
  excludedNote: string | null;
  /** SIC seat where total time is >= 2x the role minimum — likely wants PIC. */
  overqualified: boolean;
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

function parseStringArray(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
      ...candidate.files.flatMap((file) => [file.displayFilename, file.originalFilename]),
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

function aircraftAliases(aircraft: string) {
  const normalized = normalize(aircraft);
  const aliases = new Set<string>();
  if (normalized) aliases.add(normalized);
  // Pull out a compact model token (e.g. "g450", "560xl", "pc 12").
  const compact = normalized.replace(/\b(gulfstream|citation|pilatus|bombardier|cessna|learjet|dassault|falcon|embraer|hawker|beechcraft|king air)\b/g, "").trim();
  if (compact) aliases.add(compact);
  if (normalized.includes("gulfstream")) aliases.add("gulfstream");
  if (normalized.includes("citation")) aliases.add("citation");
  if (normalized.includes("pilatus") || normalized.includes("pc 12")) {
    aliases.add("pilatus");
    aliases.add("pc 12");
    aliases.add("pc12");
  }
  return Array.from(aliases).filter((alias) => alias.length >= 2);
}

function includesToken(text: string, token: string) {
  const t = normalize(token);
  return t.length > 0 && text.includes(t);
}

const HOURS_TEXT_SYNONYMS: Record<string, string[]> = {
  total_time: ["total time", "total flight time", "total hours", "total"],
  pic_time: ["pilot in command", "pic"],
  sic_time: ["second in command", "sic"],
  turbine_time: ["turbine"],
  multi_engine_time: ["multi engine", "multi-engine", "multiengine", "mel"],
  jet_time: ["jet"],
  instrument_time: ["instrument"],
  night_time: ["night"],
  cross_country_time: ["cross country", "cross-country", "xc"]
};

function detectHours(text: string, gateKey: string): number | null {
  const terms = HOURS_TEXT_SYNONYMS[gateKey] ?? [];
  for (const term of terms) {
    const safe = normalize(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!safe) continue;
    const after = new RegExp(`${safe}[^0-9]{0,18}(\\d{2,5})`, "i");
    const before = new RegExp(`(\\d{2,5})\\s*(?:hours|hrs|hr)?[^0-9]{0,12}${safe}`, "i");
    const match = text.match(after) ?? text.match(before);
    if (match?.[1]) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n >= 1 && n <= 40000) return n;
    }
  }
  return null;
}

/** Hours near an aircraft token, e.g. "G450 880 hours" — used for time in type. */
function detectHoursNearAircraft(text: string, aliases: string[]): number | null {
  for (const alias of aliases) {
    const safe = normalize(alias).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!safe) continue;
    const after = new RegExp(`${safe}[^0-9]{0,18}(\\d{2,5})`, "i");
    const before = new RegExp(`(\\d{2,5})\\s*(?:hours|hrs|hr)?[^0-9]{0,12}${safe}`, "i");
    const match = text.match(after) ?? text.match(before);
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
  override: OverrideTier | null = null
): PilotRequirementCandidateMatch {
  const text = candidateText(candidate);
  const appliedText = applicationText(candidate);
  const aircraftList = parseStringArray(requirement.aircraftTypesJson);
  const allAircraftAliases = aircraftList.flatMap(aircraftAliases);
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
    const inRatings = allAircraftAliases.some((alias) => includesToken(ratingsText, alias));
    const inProfile = allAircraftAliases.some((alias) => includesToken(text, alias));
    const inApplied = allAircraftAliases.some((alias) => includesToken(appliedText, alias));

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
      label: `Type rating — ${aircraftList[0]}`,
      category: "aircraft",
      categoryLabel: CATEGORY_LABELS.aircraft,
      status,
      requirementStatus: reqStatus(typeRatingDef) === "hard" ? "hard" : "soft",
      detail:
        status === "met"
          ? "Type rating on file"
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
  if (seat) {
    const seatAliases = seat === "pic" ? ["pic", "captain"] : seat === "sic" ? ["sic", "first officer", "fo"] : [seat];
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
      status = "met";
      source = "profile-text";
    } else if (inApplied) {
      status = "near";
      source = "application";
    } else {
      status = "missing";
      source = "none";
    }

    pushFactor({
      key: "seat",
      label: `Seat — ${requirement.pilotSeat}`,
      category: "seat",
      categoryLabel: CATEGORY_LABELS.seat,
      status,
      requirementStatus: "soft",
      detail:
        status === "met"
          ? hasSeatHours
            ? `${(seatMetric?.valueNumber ?? 0).toLocaleString()} ${seat.toUpperCase()} hrs on file`
            : `${requirement.pilotSeat} experience referenced`
          : status === "near"
            ? "Seat referenced in applications"
            : `No clear ${requirement.pilotSeat} evidence`,
      source,
      sourceLabel: sourceLabelFor(source),
      credit: status === "met" ? 1 : status === "near" ? 0.5 : 0,
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

  // --- Recency / currency (best effort — limited data today) ---------------
  {
    const recencyHit = /\b(202[3-9]|current|recurrent|type current|recent)\b/.test(text);
    pushFactor({
      key: "recency",
      label: "Recent flying evidence",
      category: "recency",
      categoryLabel: CATEGORY_LABELS.recency,
      status: recencyHit ? "met" : "unknown",
      requirementStatus: "soft",
      detail: recencyHit ? "Recent activity referenced" : "No recency signal yet",
      source: recencyHit ? "profile-text" : "none",
      sourceLabel: sourceLabelFor(recencyHit ? "profile-text" : "none"),
      credit: recencyHit ? 0.85 : 0,
      evaluated: recencyHit
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
      if (certsText.includes("atp")) {
        fStatus = "met";
        source = "structured";
        detail = "ATP on file";
      } else if (/\b(atp|airline transport)\b/.test(text)) {
        fStatus = "met";
        source = "profile-text";
        detail = "ATP referenced";
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

  // --- Roll category sub-scores --------------------------------------------
  const subScores: SubScore[] = [];
  for (const category of SCORING_CATEGORIES) {
    const catFactors = perCategory[category].filter((factor) => factor.evaluated || factor.status === "missing" || factor.status === "near");
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
  // Gate factors are the position's minimums (hard/soft). Meeting them all = 100.
  // Bonus factors are nice-to-haves: anything set to the "bonus" level, plus
  // time-in-type and recency, which only ever add. Missing data (unknown) is
  // not held against the gate score.
  const effStatus = (key: string): ReqStatus => {
    const def = SCORING_REQUIREMENT_MAP[key];
    return def ? config.requirements[def.key] ?? def.defaultStatus : "soft";
  };
  const isBonusFactor = (factor: WorkingFactor): boolean =>
    factor.key === "time_in_type" || factor.key === "recency" || effStatus(factor.key) === "bonus";

  const gateFactors = factors.filter((factor) => !isBonusFactor(factor) && factor.status !== "unknown");
  const gateWeight = gateFactors.reduce((sum, factor) => sum + statusWeight(factor.requirementStatus), 0);
  const gateEarned = gateFactors.reduce((sum, factor) => sum + statusWeight(factor.requirementStatus) * factor.credit, 0);
  const qualified = gateWeight > 0 ? Math.round((gateEarned / gateWeight) * 100) : 100;

  const BONUS_PER_FACTOR = 20;
  const BONUS_CAP = 50;
  const bonus = Math.round(
    Math.min(
      BONUS_CAP,
      factors.filter(isBonusFactor).reduce((sum, factor) => sum + Math.max(0, factor.credit) * BONUS_PER_FACTOR, 0)
    )
  );

  const total = gated ? 0 : qualified + bonus;

  // Readiness reads off the qualified (gate) score; a hard-requirement gate caps it.
  let readiness: ReadinessLabel = gated
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

  // Seat fit: an SIC role where the candidate has >= 2x the total-time minimum
  // is likely a captain who won't want a first-officer seat.
  const totalTimeMin = gatesByKey.get("total_time")?.numericValue ?? null;
  const totalTimeValue = metricsByKey.get("total_time")?.valueNumber ?? null;
  const overqualified =
    seat === "sic" &&
    typeof totalTimeMin === "number" &&
    totalTimeMin > 0 &&
    typeof totalTimeValue === "number" &&
    totalTimeValue >= totalTimeMin * 2;

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
    readiness,
    overridden,
    excludedReason: isScanExclusionReason(candidate.scanExcludedReason) ? candidate.scanExcludedReason : null,
    excludedNote: candidate.scanExcludedNote,
    overqualified,
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
  scanExcludedReason: true,
  scanExcludedNote: true,
  primaryEmail: true,
  tagsJson: true,
  foldersJson: true,
  notes: { select: { body: true }, take: 10 },
  files: { select: { displayFilename: true, originalFilename: true }, take: 10 },
  applications: { take: 10, select: { job: { select: { title: true, department: true } } } },
  metrics: {
    select: { key: true, label: true, valueNumber: true, valueText: true, unit: true, status: true, sourceSnippet: true }
  }
} as const;

export async function getPilotRequirementCandidateMatches(
  requirement: MatchRequirement | null,
  config: ScoringProfileConfig = defaultProfileConfig(),
  feedback: RequirementFeedback = {},
  overrides: TierOverrides = {},
  includeExcluded = false
): Promise<PilotRequirementCandidateMatch[]> {
  if (!requirement) return [];

  const candidates = await prisma.candidate.findMany({
    take: 250,
    where: { status: "ACTIVE", ...(includeExcluded ? {} : { scanExcludedReason: null }) },
    orderBy: { updatedAt: "desc" },
    select: candidateMatchSelect
  });

  return candidates
    .map((candidate) => scoreCandidate(requirement, candidate, config, feedback[candidate.id] ?? null, overrides[candidate.id] ?? null))
    .filter((match) => match.overridden || match.score > 0 || match.factors.some((factor) => factor.status === "met"))
    .sort((left, right) => right.score - left.score || left.candidateName.localeCompare(right.candidateName))
    .slice(0, 12);
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
  overrides: TierOverrides = {}
): Promise<PilotRequirementCandidateMatch[]> {
  if (candidateIds.length === 0) return [];

  const candidates = await prisma.candidate.findMany({
    where: { id: { in: candidateIds } },
    select: candidateMatchSelect
  });

  return candidates
    .map((candidate) => scoreCandidate(requirement, candidate, config, feedback[candidate.id] ?? null, overrides[candidate.id] ?? null))
    .sort((left, right) => right.score - left.score || left.candidateName.localeCompare(right.candidateName));
}
