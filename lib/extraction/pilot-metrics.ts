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
  { key: "multi_engine", label: "Multi-Engine", kind: "hours", unit: "hrs" },
  { key: "jet", label: "Jet", kind: "hours", unit: "hrs" },
  { key: "night", label: "Night", kind: "hours", unit: "hrs" },
  { key: "instrument", label: "Instrument", kind: "hours", unit: "hrs" },
  { key: "cross_country", label: "Cross-Country", kind: "hours", unit: "hrs" },
  { key: "type_ratings", label: "Type Ratings", kind: "list" },
  { key: "certificates", label: "Certificates", kind: "list" },
  { key: "medical_class", label: "Medical", kind: "text" }
];

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
  pic: ["pic", "pilot in command", "p\\.i\\.c"],
  sic: ["sic", "second in command", "s\\.i\\.c"],
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

export function extractPilotMetrics(text: string): ExtractedMetric[] {
  if (!text || text.trim().length === 0) return [];
  const results: ExtractedMetric[] = [];

  for (const def of METRIC_DEFS) {
    if (def.kind === "hours") {
      const found = findHours(text, HOURS_SYNONYMS[def.key] ?? [def.label.toLowerCase()]);
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
