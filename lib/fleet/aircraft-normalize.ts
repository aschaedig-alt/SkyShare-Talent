import { FLEET_POSITIONS } from "@/lib/fleet/positions";

/**
 * Canonicalise an aircraft designator as written on a resume.
 *
 * Extraction records the airframe exactly as the candidate typed it, which
 * fragments one aircraft across many keys — the corpus produced 592 distinct
 * designators for 14 fleet types: GV / G-V, GIV / G-IV, PC-12 / PC12 /
 * PILATUS PC-12, C172 / C-172 / CESSNA 172. That matters because time-in-type
 * is looked up BY AIRCRAFT when scoring; a mismatch reads as "unknown" and
 * silently forfeits a category worth 12% of the match.
 *
 * Two rulings from the DoM/Chief Pilot are encoded here:
 *   - GV time counts toward a G450 requirement (the fleet already treats them
 *     as one position, "Gulfstream G450 & GV").
 *   - PC-12 NG / NGX time is interchangeable with plain PC-12.
 *
 * Anything that is not a fleet type is still kept, just tidied — B737 and A320
 * time is real evidence of turbine and jet experience even though SkyShare
 * does not operate them.
 */

/** Strip punctuation, manufacturer words and spacing so variants collapse. */
function squash(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\b(CESSNA|AIRBUS|BOEING|PILATUS|GULFSTREAM|EMBRAER|LEARJET|LEAR|BOMBARDIER|BEECHCRAFT|BEECH|DASSAULT|HAWKER|MITSUBISHI|CANADAIR|HONDA)\b/g, " ")
    .replace(/\b(SERIES|TYPE|RATING|MODEL)\b/g, " ")
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

/**
 * Alias groups → the fleet's own name. Keys are squashed forms, so "PC-12",
 * "PC 12" and "Pilatus PC-12" all arrive here as "PC12".
 */
const FLEET_ALIASES: Array<{ canonical: string; match: string[] }> = [
  // The G450 lineage. GIV is the airframe the G450 descends from, and the
  // fleet already books G450 and GV as a single position.
  { canonical: "Gulfstream G450 & GV", match: ["GV", "G5", "GIV", "G4", "G450", "GIVSP", "G450GV", "GULFSTREAMV", "GULFSTREAMIV"] },
  { canonical: "Gulfstream G200", match: ["G200", "GALAXY", "G100", "IAI1126"] },
  // NG and NGX are interchangeable with the base PC-12 for our purposes.
  { canonical: "Pilatus PC-12", match: ["PC12", "PC12NG", "PC12NGX", "PC1245", "PC1247", "PC1245I", "PILATUSPC12", "PC12NG45", "PC1247E"] },
  { canonical: "Citation 560XL", match: ["CE560XL", "560XL", "C560XL", "XL", "EXCEL", "CITATIONXL"] },
  { canonical: "Citation 560XLS+", match: ["CE560XLS", "560XLS", "XLS", "XLSPLUS", "560XLSPLUS"] },
  { canonical: "Citation CJ2", match: ["CJ2", "CE525A", "C525A", "525A"] },
  { canonical: "Citation CJ", match: ["CJ", "CJ1", "CE525", "C525", "525", "CE500", "C500", "CITATIONJET"] },
  { canonical: "Citation M2", match: ["M2", "CE525M2", "C525M2"] },
  { canonical: "Phenom 100", match: ["PHENOM100", "EMB500", "E50P"] },
  { canonical: "Phenom 300", match: ["PHENOM300", "EMB505", "E55P"] },
  { canonical: "Legacy 650", match: ["LEGACY650", "EMB135BJ", "LEGACY600"] }
];

const LOOKUP = new Map<string, string>();
for (const group of FLEET_ALIASES) {
  for (const alias of group.match) LOOKUP.set(alias, group.canonical);
}

/**
 * Fleet names resolve to themselves — but NEVER over an alias group. The
 * registry lists "Gulfstream G450" and "Gulfstream G450 & GV" as separate
 * positions, and "Pilatus PC-12 NG"/"NGX" separately from "Pilatus PC-12";
 * letting those self-map would re-split the very groups the rulings above
 * merge, leaving G450 hours in one bucket and GV hours in another.
 */
for (const position of FLEET_POSITIONS) {
  if (!position.aircraft) continue;
  const key = squash(position.aircraft);
  if (!LOOKUP.has(key)) LOOKUP.set(key, position.aircraft);
}

export type NormalizedAircraft = { canonical: string; isFleet: boolean };

export function normalizeAircraft(raw: string): NormalizedAircraft {
  const squashed = squash(raw);
  if (!squashed) return { canonical: raw.trim().toUpperCase(), isFleet: false };
  const fleet = LOOKUP.get(squashed);
  if (fleet) return { canonical: fleet, isFleet: true };
  // Not ours — keep a tidied form so C172 / C-172 / CESSNA 172 still merge.
  return { canonical: squashed, isFleet: false };
}

/** The metric key a time-in-type value should be filed under. */
export function timeInTypeKey(raw: string, pic = false): string {
  return `${pic ? "pic_time_in_type" : "time_in_type"}:${normalizeAircraft(raw).canonical}`;
}
