/**
 * Pilot metric extraction from resume / pilot-app text.
 *
 * DEV NOTE: this uses free pattern-matching. It is intentionally simple and will
 * miss values phrased unusually — that's why extracted values are SUGGESTED for
 * human confirmation, not auto-saved. Planned upgrade: swap extractPilotMetrics()
 * for a Claude LLM call once the feature is proven (see memory: extraction-llm-upgrade).
 */

export type MetricKind = "hours" | "list" | "text";

export type MetricDef = {
  key: string;
  label: string;
  kind: MetricKind;
  unit?: string;
};

export const METRIC_DEFS: MetricDef[] = [
  { key: "total_time", label: "Total Time", kind: "hours", unit: "hrs" },
  { key: "pic", label: "PIC", kind: "hours", unit: "hrs" },
  { key: "sic", label: "SIC", kind: "hours", unit: "hrs" },
  { key: "turbine", label: "Turbine", kind: "hours", unit: "hrs" },
  { key: "turbine_pic", label: "Turbine PIC", kind: "hours", unit: "hrs" },
  { key: "multi_engine", label: "Multi-Engine", kind: "hours", unit: "hrs" },
  { key: "multi_engine_pic", label: "Multi-Engine PIC", kind: "hours", unit: "hrs" },
  { key: "jet", label: "Jet", kind: "hours", unit: "hrs" },
  { key: "jet_pic", label: "Jet PIC", kind: "hours", unit: "hrs" },
  { key: "night", label: "Night", kind: "hours", unit: "hrs" },
  { key: "instrument", label: "Total Instrument", kind: "hours", unit: "hrs" },
  { key: "instrument_actual", label: "Actual Instrument", kind: "hours", unit: "hrs" },
  { key: "instrument_simulated", label: "Simulated Instrument", kind: "hours", unit: "hrs" },
  { key: "cross_country", label: "Cross-Country", kind: "hours", unit: "hrs" },
  { key: "single_pilot", label: "Single Pilot", kind: "hours", unit: "hrs" },
  // Currency. recency_12mo already drives the Recency scoring category but has
  // never had anything filling it; hours_in_type_applying is the same idea
  // scoped to the airframe the person applied for.
  { key: "recency_12mo", label: "Hours (last 12 mo)", kind: "hours", unit: "hrs" },
  { key: "hours_in_type_applying", label: "Hours in Aircraft Applied For", kind: "hours", unit: "hrs" },
  // Aircraft-specific. These are NOT extracted as plain scalars — see
  // pilot-metrics-llm.ts, which pulls a list of (aircraft, hours) pairs and
  // writes one row per type as "time_in_type:<AIRCRAFT>". The bare keys below
  // hold the largest single entry so there is something to show in a column.
  { key: "time_in_type", label: "Time in Type", kind: "hours", unit: "hrs" },
  { key: "pic_time_in_type", label: "PIC Time in Type", kind: "hours", unit: "hrs" },
  { key: "type_ratings", label: "Type Ratings", kind: "list" },
  { key: "certificates", label: "Certificates", kind: "list" },
  { key: "medical_class", label: "Medical", kind: "text" }
];

// For "Label (PIC): TOTAL (PIC-portion)" rows, the base synonym used to find the PIC sub-value.
const PIC_BASE_SYNONYM: Record<string, string> = {
  jet_pic: "jet",
  turbine_pic: "turbine",
  multi_engine_pic: "multi-?engine|multi engine"
};

export type ExtractedMetric = {
  key: string;
  label: string;
  valueNumber?: number;
  valueText?: string;
  unit?: string;
  snippet: string;
};

// Synonyms used to locate each hours metric (case-insensitive).
const HOURS_SYNONYMS: Record<string, string[]> = {
  total_time: ["total time", "total flight time", "total hours", "total\\s*time", "\\btotal\\b", "\\bTT\\b"],
  pic: ["pilot in command", "\\bPIC\\b(?!\\s*privile)", "p\\.i\\.c"],
  sic: ["second in command", "\\bSIC\\b(?!\\s*privile)", "s\\.i\\.c"],
  turbine: ["turbine"],
  multi_engine: ["multi-engine", "multi engine", "multiengine", "\\bMEL\\b", "\\bME\\b"],
  jet: ["jet"],
  night: ["night"],
  instrument: ["instrument", "actual instrument"],
  cross_country: ["cross country", "cross-country", "\\bXC\\b"]
};

// Common business/charter type ratings to scan for.
const TYPE_RATING_TOKENS = [
  "GV", "GIV", "GVII", "G280", "G450", "G500", "G550", "G600", "G650",
  "CL-30", "CL-35", "CL-60", "CL30", "CL35", "CL60", "CL65",
  "CE-500", "CE-525", "CE-560", "CE-650", "CE-680", "CE-750", "CE500", "CE525", "CE560", "CE680", "CE750",
  "LR-31", "LR-45", "LR-60", "LR-JET", "LR31", "LR45", "LR60",
  "FA-50", "FA-7X", "FA-900", "FA-2000", "DA-50", "DA-2000",
  "HS-125", "BE-400", "EMB-505", "EMB-545", "PC-12",
  "B737", "B767", "B757", "A320"
];

const CERT_TOKENS: Array<[RegExp, string]> = [
  [/\bairline transport pilot\b|\bATP\b/i, "ATP"],
  [/\bcommercial pilot\b|\bcommercial\b/i, "Commercial"],
  [/\bCFII\b/i, "CFII"],
  [/\bCFI\b/i, "CFI"],
  [/\bMEI\b/i, "MEI"],
  [/\bflight engineer\b|\bFE\b/i, "Flight Engineer"],
  [/\bprivate pilot\b/i, "Private"]
];

function snippetAround(text: string, index: number, len: number): string {
  const start = Math.max(0, index - 45);
  const end = Math.min(text.length, index + len + 55);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

function parseNumber(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  // Flight hours are realistically 0–40,000. Filter obvious non-hours (years, phone fragments).
  if (n < 1 || n > 40000) return null;
  return Math.round(n);
}

function findHours(text: string, synonyms: string[]): { value: number; snippet: string } | null {
  for (const syn of synonyms) {
    // label, then up to ~18 non-digit chars, then a number
    const re = new RegExp(`(${syn})[^0-9]{0,18}([0-9][0-9,]{1,6})`, "i");
    const m = re.exec(text);
    if (m && m.index !== undefined) {
      const value = parseNumber(m[2]);
      if (value !== null) {
        return { value, snippet: snippetAround(text, m.index, m[0].length) };
      }
    }
  }
  return null;
}

/** Capture the parenthetical PIC sub-value, e.g. "Jet (PIC): 1175 (720)" → 720. */
function findPicPortion(text: string, baseSyn: string): { value: number; snippet: string } | null {
  const re = new RegExp(`(?:${baseSyn})\\s*\\(\\s*pic\\s*\\)\\s*[:\\-]?\\s*[0-9][0-9,]{0,6}\\s*\\(\\s*([0-9][0-9,]{0,6})\\s*\\)`, "i");
  const m = re.exec(text);
  if (m && m.index !== undefined) {
    const value = parseNumber(m[1]);
    if (value !== null) {
      return { value, snippet: snippetAround(text, m.index, m[0].length) };
    }
  }
  return null;
}

export function extractPilotMetrics(text: string): ExtractedMetric[] {
  if (!text || text.trim().length === 0) return [];
  const results: ExtractedMetric[] = [];

  for (const def of METRIC_DEFS) {
    if (def.kind === "hours") {
      const found = PIC_BASE_SYNONYM[def.key]
        ? findPicPortion(text, PIC_BASE_SYNONYM[def.key])
        : findHours(text, HOURS_SYNONYMS[def.key] ?? [def.label.toLowerCase()]);
      if (found) {
        results.push({ key: def.key, label: def.label, valueNumber: found.value, unit: def.unit, snippet: found.snippet });
      }
    } else if (def.key === "type_ratings") {
      const found = new Set<string>();
      let firstIdx = -1;
      for (const token of TYPE_RATING_TOKENS) {
        const re = new RegExp(`\\b${token.replace(/[-]/g, "[- ]?")}\\b`, "i");
        const m = re.exec(text);
        if (m) {
          found.add(token.toUpperCase());
          if (firstIdx === -1 || (m.index ?? 0) < firstIdx) firstIdx = m.index ?? 0;
        }
      }
      if (found.size > 0) {
        results.push({
          key: def.key,
          label: def.label,
          valueText: Array.from(found).join(", "),
          snippet: firstIdx >= 0 ? snippetAround(text, firstIdx, 10) : ""
        });
      }
    } else if (def.key === "certificates") {
      const found: string[] = [];
      let firstIdx = -1;
      for (const [re, name] of CERT_TOKENS) {
        const m = re.exec(text);
        if (m && !found.includes(name)) {
          found.push(name);
          if (firstIdx === -1 || (m.index ?? 0) < firstIdx) firstIdx = m.index ?? 0;
        }
      }
      if (found.length > 0) {
        results.push({
          key: def.key,
          label: def.label,
          valueText: found.join(", "),
          snippet: firstIdx >= 0 ? snippetAround(text, firstIdx, 10) : ""
        });
      }
    } else if (def.key === "medical_class") {
      const m = /(first|second|third)[\s-]*class(?:\s*medical)?/i.exec(text);
      if (m && m.index !== undefined) {
        const cls = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
        results.push({
          key: def.key,
          label: def.label,
          valueText: `${cls} Class`,
          snippet: snippetAround(text, m.index, m[0].length)
        });
      }
    }
  }

  return results;
}
