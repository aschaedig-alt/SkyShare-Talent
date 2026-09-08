/**
 * Aircraft type ratings — the reference list the Types column is checked against.
 *
 * WHY THIS EXISTS. Type ratings arrive as free text extracted from resumes, so
 * the same aircraft turns up seven ways ("CE-525", "CE525", "Citation CE-525",
 * "CE-525 SIC", "CE-525 (CJ2)"…), mixed in with things that are not type
 * ratings at all (AMEL, Instrument, Tailwheel) and with the seat somebody flew
 * it in. Filtering "who is CE-525 typed" cannot work against that.
 *
 * WHAT IT DOES NOT DO: it never rewrites stored data. normalizeAircraftType is
 * applied when the value is READ, so the original text stays on the record and
 * a wrong entry here is fixed by editing this file, not by re-migrating.
 *
 * THE RULE: an AIRCRAFT is kept, a LICENCE is dropped.
 *
 * If the value names something somebody has flown, it belongs in the column —
 * including aircraft that need no type rating at all, because "2,000 hours in a
 * PC-12" is exactly what a PC-12 operator is looking for and the certificate is
 * beside the point. What gets dropped is the licence: class ratings (AMEL,
 * Multi-Engine Land), certificates (CFI, ATP), endorsements (Tailwheel,
 * Complex), the instrument rating, and the seat somebody sat in.
 * NO_TYPE_RATING_REQUIRED marks which entries are in the first camp without a
 * rating behind them, so the list stays honest about the difference.
 *
 * ACCURACY, HONESTLY. The designators are the FAA-style ones used on a
 * certificate, compiled against the 168 distinct values actually on file rather
 * than from an official document — so treat the list as a good first pass that
 * a pilot should read, not as authoritative. One deliberate simplification:
 * where a rating covers a family (LR-JET covers the Learjet 20/30/50 series;
 * CE-500 covers the straight-wing Citations), the family is one entry, which is
 * what the certificate actually says.
 *
 * CANONICAL SPELLING follows whatever already dominates the data, so the change
 * is small: hyphens for CE- and CL- designators, none for the Gulfstream
 * numbers. Change a `type` value here and it changes everywhere at once.
 */

export type AircraftType = {
  /** The canonical designator shown on screen. */
  type: string;
  /** Plain name, for a tooltip — nobody outside the cockpit reads "CE-560XL". */
  name: string;
  /** Everything seen in the data (and near-misses), lowercased, no punctuation. */
  aliases: string[];
};

/**
 * Not type ratings. These are certificates, class ratings, endorsements or a
 * seat — real information about a pilot, but not an answer to "what are they
 * typed on", which is what the column is for.
 */
export const NON_TYPE_TERMS: Record<string, string> = {
  amel: "Airplane Multi-Engine Land (class rating)",
  asel: "Airplane Single-Engine Land (class rating)",
  ames: "Airplane Multi-Engine Sea (class rating)",
  ases: "Airplane Single-Engine Sea (class rating)",
  mel: "Multi-Engine Land (class rating)",
  sel: "Single-Engine Land (class rating)",
  multiengineland: "Multi-Engine Land (class rating)",
  singleengineland: "Single-Engine Land (class rating)",
  multiengine: "Multi-engine (class rating)",
  singleengine: "Single-engine (class rating)",
  instrument: "Instrument rating",
  instrumentrating: "Instrument rating",
  instrumentairplane: "Instrument rating",
  cfi: "Flight instructor certificate",
  cfii: "Instrument flight instructor certificate",
  mei: "Multi-engine instructor certificate",
  atp: "Airline Transport Pilot certificate",
  commercial: "Commercial certificate",
  private: "Private certificate",
  highperformance: "High-performance endorsement",
  complex: "Complex endorsement",
  tailwheel: "Tailwheel endorsement",
  pressurized: "Pressurised endorsement",
  pic: "A seat, not a type",
  sic: "A seat, not a type",
  captain: "A seat, not a type",
  firstofficer: "A seat, not a type",
  singlepilot: "A privilege, not a type",
  jetall: "Not a specific type",
  jet: "Not a specific type"
};

/**
 * AN AIRCRAFT IS ALWAYS KEPT, whether or not it carries a type rating.
 *
 * A PC-12 needs no type rating in the US, and neither does a Caravan or a
 * Baron — but "has time in a PC-12" is exactly what a recruiter is looking for,
 * so the column lists the aircraft. Only ratings, certificates, endorsements
 * and seats are dropped: those describe a licence, not an aeroplane somebody
 * has flown.
 *
 * These entries live in AIRCRAFT_TYPES below alongside the type-rated ones, and
 * are flagged so the reference stays honest about which is which.
 */
export const NO_TYPE_RATING_REQUIRED = new Set([
  "PC-12",
  "C-208",
  "PA-32",
  "PA-31",
  "BE-58",
  "BE-200",
  "C-172",
  "C-182",
  "C-206",
  "SR-22"
]);

/**
 * Suffixes and qualifiers stripped before matching, so "CE-525 SIC",
 * "CE-525 (CJ2)" and "CE-525 Series" all reach the same entry. The seat is
 * dropped rather than kept because it belongs on the application, not on the
 * rating — a pilot typed on a CE-525 is typed on it whichever seat they flew.
 */
const STRIP_PATTERNS: RegExp[] = [
  /\((?:pic|sic)[^)]*\)/gi,
  /\b(pic|sic)\b/gi,
  /\b(captain|first officer|f\/o|fo)\b/gi,
  /\bsingle[- ]?pilot\b/gi,
  /\bseries\b/gi,
  /\btype\s*rating\b/gi,
  /\btyped?\b/gi,
  /\brating\b/gi,
  /\bfaa\b|\bicao\b/gi
];

/**
 * Manufacturer words that add nothing once the designator is known.
 *
 * "jet" is in here so "LR Jet 25" reduces to "lr25", which IS a known alias.
 * It is safe because a bare "Jet" is classified as not-a-type on the untouched
 * string, one step earlier — this pass only ever runs after that failed.
 */
const MAKER_WORDS =
  /\b(cessna|citation|gulfstream|embraer|pilatus|beech(craft)?|bombardier|canadair|hawker|raytheon|learjet|lear|dassault|falcon|challenger|phenom|legacy|boeing|airbus|mcdonnell douglas|douglas|saab|shorts|honda(jet)?|mitsubishi|israel aircraft|iai|sikorsky|de ?havilland|jet)\b/gi;

export const AIRCRAFT_TYPES: AircraftType[] = [
  // ---- Cessna Citation ---------------------------------------------------
  // The bare numbers ("500", "650", "727") are reachable only after the maker
  // word is stripped, which is the third and last thing tried — so they are
  // safe here and would be ambiguous anywhere earlier.
  { type: "CE-500", name: "Citation I / II / Bravo (straight-wing)", aliases: ["ce500", "c500", "500", "citation500", "citation500series", "ce550", "c550", "citationii", "citationbravo"] },
  { type: "CE-510", name: "Citation Mustang", aliases: ["ce510", "c510", "ce510s", "citationmustang"] },
  { type: "CE-525", name: "Citation CJ family (CJ1–CJ4, M2)", aliases: ["ce525", "c525", "c525m", "ce525s", "citation525", "citation525s", "cj", "cj1", "cj1plus", "cj2", "cj2plus", "cj3", "cj3plus", "cj4", "m2", "m2plus", "citationjet"] },
  { type: "CE-560", name: "Citation V / Ultra / Encore", aliases: ["ce560", "c560", "c565", "citationv", "citationultra", "citationencore"] },
  { type: "CE-560XL", name: "Citation Excel / XLS", aliases: ["560xl", "560xls", "ce560xl", "c560xl", "citation560xl", "citation560xls", "xls", "xl", "citationexcel", "citationxls"] },
  { type: "CE-650", name: "Citation III / VI / VII", aliases: ["650", "ce650", "c650", "citation650"] },
  { type: "CE-680", name: "Citation Sovereign / Latitude", aliases: ["ce680", "c680", "citationsovereign", "citationlatitude"] },
  { type: "CE-700", name: "Citation Longitude", aliases: ["ce700", "c700", "citationlongitude"] },
  { type: "CE-750", name: "Citation X", aliases: ["ce750", "c750", "citationx"] },
  { type: "C-208", name: "Cessna Caravan", aliases: ["c208", "ce208", "caravan", "caravan208b", "c208b", "grandcaravan"] },

  // ---- Gulfstream --------------------------------------------------------
  { type: "G-1159", name: "Gulfstream II / III", aliases: ["g1159", "gii", "giii", "g2", "g3"] },
  { type: "GIV", name: "Gulfstream IV / G300 / G400", aliases: ["giv", "g4", "giv sp", "givsp", "g300", "g400"] },
  { type: "GV", name: "Gulfstream V / G500 / G550", aliases: ["gv", "g5", "gvsp", "g500", "g550"] },
  { type: "GVI", name: "Gulfstream G650", aliases: ["gvi", "g650", "g650er"] },
  { type: "GVII", name: "Gulfstream G500 / G600 (GVII)", aliases: ["gvii", "g600"] },
  { type: "G-100", name: "Gulfstream G100 / Astra", aliases: ["g100", "astra", "ia1125", "ia1125astra"] },
  { type: "G-150", name: "Gulfstream G150", aliases: ["g150"] },
  { type: "G-200", name: "Gulfstream G200 / Galaxy", aliases: ["g200", "galaxy", "ia1126"] },
  { type: "G-280", name: "Gulfstream G280", aliases: ["g280"] },
  { type: "G-450", name: "Gulfstream G350 / G450", aliases: ["g450", "g350"] },

  // ---- Bombardier / Canadair --------------------------------------------
  { type: "CL-30", name: "Challenger 300 / 350 (BD-100)", aliases: ["challenger3500", "cl3500", "3500", "cl30", "bd100", "challenger300", "challenger350", "chal300", "chal350"] },
  { type: "CL-600", name: "Challenger 600 / 601 / 604 / 605", aliases: ["cl600", "cl601", "cl604", "cl605", "cl64", "challenger600", "challenger601", "challenger604"] },
  { type: "CL-65", name: "Canadair Regional Jet (CRJ)", aliases: ["cl65", "crj", "crj200", "crj700", "crj900"] },
  { type: "BD-700", name: "Global Express / Global 5000–7500", aliases: ["bd700", "globalexpress", "global5000", "global6000", "global7500"] },
  { type: "LR-JET", name: "Learjet 20 / 30 / 50 series", aliases: ["lrjet", "lr20", "lr23", "lr24", "lr25", "lr28", "lr31", "lr35", "lr36", "lr55", "learjet25", "learjet31", "learjet35", "learjet36", "learjet55"] },
  { type: "LR-45", name: "Learjet 40 / 45 / 70 / 75", aliases: ["lr40", "lr45", "lr70", "lr75", "learjet40", "learjet45", "learjet70", "learjet75"] },
  { type: "LR-60", name: "Learjet 60", aliases: ["lr60", "learjet60"] },

  // ---- Embraer -----------------------------------------------------------
  { type: "EMB-500", name: "Phenom 100", aliases: ["emb500", "e500", "phenom100", "embraerphenomemb500"] },
  { type: "EMB-505", name: "Phenom 300", aliases: ["emb505", "e505", "phenom300"] },
  { type: "EMB-545", name: "Legacy 450 / 500, Praetor", aliases: ["emb545", "emb550", "legacy450", "legacy500", "praetor500", "praetor600"] },
  { type: "EMB-135", name: "ERJ-135 / 140 / 145 / Legacy 600-650", aliases: ["erj135", "erj140", "erj145", "e135", "e145", "emb135", "emb145", "legacy600", "legacy650"] },
  { type: "EMB-170", name: "E-Jet 170 / 175 / 190 / 195", aliases: ["erj170", "erj175", "erj190", "erj195", "e170", "e175", "e190", "e195", "emb170", "emb175"] },
  { type: "EMB-110", name: "Bandeirante", aliases: ["emb110", "e110", "bandeirante"] },
  { type: "EMB-120", name: "Brasilia", aliases: ["emb120", "e120", "brasilia"] },

  // ---- Other business jets ----------------------------------------------
  { type: "HS-125", name: "Hawker 125 / 700 / 800 / 900", aliases: ["hs125", "h125", "hawker125", "hawker700", "hawker800", "hawker800xp", "hawker900", "hawker900xp", "beechjet400a"] },
  { type: "RA-4000", name: "Hawker 4000", aliases: ["ra4000", "hawker4000"] },
  { type: "BE-400", name: "Beechjet 400 / Hawker 400XP", aliases: ["be400", "be400a", "beechjet400", "hawker400xp", "mu300", "diamond1a"] },
  { type: "BE-300", name: "King Air 300 / 350", aliases: ["be300", "be350", "kingair300", "kingair350"] },
  { type: "BE-200", name: "King Air 200", aliases: ["be200", "kingair200", "b200"] },
  { type: "BE-1900", name: "Beech 1900", aliases: ["be1900", "beech1900"] },
  { type: "DA-50", name: "Falcon 50", aliases: ["da50", "falcon50"] },
  { type: "DA-10", name: "Falcon 10", aliases: ["da10", "falcon10"] },
  { type: "DA-20", name: "Falcon 20", aliases: ["da20", "falcon20"] },
  { type: "DA-900", name: "Falcon 900", aliases: ["da900", "falcon900"] },
  { type: "DA-2000", name: "Falcon 2000", aliases: ["da2000", "falcon2000"] },
  { type: "DA-7X", name: "Falcon 7X / 8X", aliases: ["da7x", "da8x", "falcon7x", "falcon8x"] },
  { type: "HA-420", name: "HondaJet", aliases: ["ha420", "hondajet"] },
  { type: "IA-1124", name: "IAI Westwind", aliases: ["ia1124", "ia24", "westwind", "westwindi", "westwindii", "westwindiii"] },

  // ---- Turboprop / regional ---------------------------------------------
  { type: "PC-12", name: "Pilatus PC-12", aliases: ["pc12", "pilatuspc12", "pc12legacy", "pc12ng", "pc12ngx"] },
  { type: "DHC-8", name: "de Havilland Dash 8", aliases: ["dhc8", "dash8", "q400"] },
  { type: "SA-227", name: "Fairchild Metroliner", aliases: ["sa227", "metroliner", "metro"] },
  { type: "SF-340", name: "Saab 340", aliases: ["340b", "sf340", "saab340", "saab340b"] },
  { type: "SD-3", name: "Shorts 330 / 360", aliases: ["sd3", "shorts330", "shorts360"] },

  // ---- Air transport (shows up on resumes) ------------------------------
  { type: "A-320", name: "Airbus A318 / A319 / A320 / A321", aliases: ["a320", "a318", "a319", "a321", "a320family"] },
  { type: "B-727", name: "Boeing 727", aliases: ["727", "b727", "boeing727"] },
  { type: "B-737", name: "Boeing 737", aliases: ["b737", "boeing737", "737ng", "b737ng", "737max", "b7377"] },
  { type: "B-757", name: "Boeing 757", aliases: ["757", "b757", "boeing757"] },
  { type: "B-767", name: "Boeing 767", aliases: ["767", "b767", "boeing767"] },
  { type: "B-777", name: "Boeing 777", aliases: ["777", "b777", "boeing777"] },
  { type: "DC-10", name: "McDonnell Douglas DC-10", aliases: ["dc10"] },
  { type: "MD-11", name: "McDonnell Douglas MD-11", aliases: ["md11"] },

  // ---- Rotorcraft (rare here, but present) ------------------------------
  { type: "S-70", name: "Sikorsky S-70 / UH-60", aliases: ["s70", "s70m", "uh60", "sikorskys70m"] },

  // ---- No type rating required, KEPT ANYWAY ------------------------------
  // Time in type is the point. A pilot with 2,000 hours in a PC-12 is exactly
  // who a PC-12 operator wants, and the certificate saying no type rating was
  // needed does not change that. See NO_TYPE_RATING_REQUIRED above.
  { type: "PA-32", name: "Piper Cherokee Six / Saratoga", aliases: ["pa32", "cherokeesix", "saratoga"] },
  { type: "PA-31", name: "Piper Navajo", aliases: ["pa31", "navajo", "chieftain"] },
  { type: "BE-58", name: "Beech 58 Baron", aliases: ["be58", "baron", "baron58"] },
  { type: "C-172", name: "Cessna 172 Skyhawk", aliases: ["c172", "cessna172", "skyhawk"] },
  { type: "C-182", name: "Cessna 182 Skylane", aliases: ["c182", "cessna182", "skylane"] },
  { type: "C-206", name: "Cessna 206 Stationair", aliases: ["c206", "cessna206", "stationair"] },
  { type: "SR-22", name: "Cirrus SR22", aliases: ["sr22", "cirrussr22", "sr20"] }
];

/** alias -> canonical, built once. */
const ALIAS_TO_TYPE = new Map<string, string>();
for (const t of AIRCRAFT_TYPES) {
  ALIAS_TO_TYPE.set(t.type.toLowerCase().replace(/[^a-z0-9]/g, ""), t.type);
  for (const a of t.aliases) ALIAS_TO_TYPE.set(a.replace(/[^a-z0-9]/g, ""), t.type);
}

export const TYPE_BY_DESIGNATOR = new Map(AIRCRAFT_TYPES.map((t) => [t.type, t]));

export type TypeMatch =
  | { kind: "type"; type: string; name: string }
  | { kind: "not-a-type"; reason: string }
  | { kind: "unknown" };

/**
 * What is this stored value?
 *
 * Returns the canonical type, or says it is not a type rating and why, or says
 * it does not recognise it. UNKNOWN IS DELIBERATELY NOT DROPPED by callers —
 * an unrecognised value is far more likely to be an aircraft this list has not
 * met than junk, and silently hiding it would lose real information.
 */
/** "CJ1+" -> "cj1plus", so a + survives punctuation stripping. */
function keyOf(s: string): string {
  return s
    .toLowerCase()
    .replace(/\+/g, "plus")
    .replace(/[^a-z0-9]/g, "");
}

export function normalizeAircraftType(raw: string): TypeMatch {
  const asType = (t: string): TypeMatch => ({
    kind: "type",
    type: t,
    name: TYPE_BY_DESIGNATOR.get(t)?.name ?? t
  });

  // Tried in WIDENING order, and the order is the whole trick. Matching the
  // untouched string first is what lets "Phenom 100", "Boeing 727" and
  // "Learjet 31" resolve — stripping the manufacturer first, as this used to,
  // left a bare "100" / "727" / "31" that matches nothing and is ambiguous
  // between makers anyway.
  const candidates: string[] = [];
  candidates.push(raw);

  let seatless = raw;
  for (const p of STRIP_PATTERNS) seatless = seatless.replace(p, " ");
  candidates.push(seatless);

  candidates.push(seatless.replace(MAKER_WORDS, " "));

  for (const c of candidates) {
    const key = keyOf(c);
    if (!key) continue;
    const nonType = NON_TYPE_TERMS[key];
    if (nonType) return { kind: "not-a-type", reason: nonType };
    const hit = ALIAS_TO_TYPE.get(key);
    if (hit) return asType(hit);
  }

  // A bare "PIC" or "SEL" reaches here only if stripping emptied it, which is
  // exactly when it WAS the whole value — so classify on the original.
  const rawKey = keyOf(raw);
  if (NON_TYPE_TERMS[rawKey]) return { kind: "not-a-type", reason: NON_TYPE_TERMS[rawKey] };

  return { kind: "unknown" };
}

/**
 * The letters a model number hangs off, for continuing a family across slashes.
 *
 * "GV/550/500/450" means the Gulfstream 550, 500 and 450 — the G is carried
 * over. Taken from the matched type's own aliases rather than guessed, so it
 * stays right when an entry is edited.
 */
function familyPrefixes(type: string): string[] {
  const entry = TYPE_BY_DESIGNATOR.get(type);
  if (!entry) return [];
  const out = new Set<string>();
  for (const a of [entry.type, ...entry.aliases]) {
    const k = keyOf(a);
    const m = k.match(/^([a-z]+)\d/);
    if (m) out.add(m[1]);
    // Pure-letter aliases are prefixes too, for families numbered in roman:
    // "WESTWIND I & II" needs "westwind" + "ii" to resolve the second one.
    else if (/^[a-z]+$/.test(k) && k.length >= 3) out.add(k);
  }
  return [...out];
}

/**
 * Turn one stored type_ratings value into the types it actually names.
 *
 * DOES NOT SPLIT ON "/" — that is what turned "GV/550/500/450" into three
 * orphan numbers on ten people's rows. Slashes inside a value are part of how
 * pilots write a family, so the whole run is matched first and only split if
 * that fails.
 *
 * Returns the canonical types, deduplicated and in the order first seen, plus
 * anything it could not place so a caller can show or count it honestly.
 */
export function parseTypeRatings(value: string | null | undefined): {
  types: string[];
  notTypes: Array<{ raw: string; reason: string }>;
  unknown: string[];
} {
  const types: string[] = [];
  const notTypes: Array<{ raw: string; reason: string }> = [];
  const unknown: string[] = [];
  if (!value) return { types, notTypes, unknown };

  // BRACKETS COME OUT FIRST, and this is why: a bracketed run is a sub-model
  // list — "Citation CE-525 (CJ, CJ1, CJ2, M2)" — whose commas would otherwise
  // split it into fragments like "Citation CE-525 (CJ" and "M2)". The
  // designator outside the brackets is the type; what is inside repeats it.
  // The open-ended form handles a bracket the extractor never closed.
  const debracketed = value.replace(/\([^)]*\)?/g, " ").replace(/\)/g, " ");

  const parts = debracketed
    .split(/[,;|]+|\s+&\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const push = (m: TypeMatch, raw: string) => {
    if (m.kind === "type") {
      if (!types.includes(m.type)) types.push(m.type);
    } else if (m.kind === "not-a-type") {
      notTypes.push({ raw, reason: m.reason });
    } else if (raw.trim()) {
      if (!unknown.includes(raw.trim())) unknown.push(raw.trim());
    }
  };

  // The family carries ACROSS commas within one value, because people write
  // "Learjet 31/35/36/55, 40/45/70/75 SIC" and mean one run of Learjets. It is
  // scoped to a single stored value, so it can never leak between candidates.
  let prefixes: string[] = [];

  /**
   * Match one piece, letting an established family win over a bare alias.
   *
   * Used for whole parts AND for slash-separated pieces, because both can be a
   * continuation: "WESTWIND I & II" splits on the ampersand into two PARTS, so
   * a retry that only ran inside the slash branch left the "II" unresolved.
   */
  const resolve = (piece: string): TypeMatch => {
    let bare = piece;
    for (const p of STRIP_PATTERNS) bare = bare.replace(p, " ");
    bare = bare.trim();

    // THE FAMILY WINS OVER A BARE ALIAS. "500" on its own is a Citation, but
    // the 500 in "GV/550/500/450" is a Gulfstream — matching the bare alias
    // first put a CE-500 on a pilot with no Citation at all.
    if (prefixes.length && /^[ivx]+$|^\d+[a-z]*$/i.test(bare)) {
      for (const p of prefixes) {
        const retry = normalizeAircraftType(p + bare);
        if (retry.kind === "type") return retry;
      }
    }
    return normalizeAircraftType(piece);
  };

  for (const part of parts) {
    const whole = resolve(part);
    if (whole.kind !== "unknown") {
      if (whole.kind === "type") prefixes = familyPrefixes(whole.type);
      push(whole, part);
      continue;
    }

    // Only now try the slash- or dash-separated pieces. "GV/550/500/450" and
    // "LR Jet 25-31-35-55" are both one family written compactly, so the whole
    // is tried first and this only runs when that failed.
    const pieces = part.split(/\s*[/]\s*|(?<=\d)-(?=\d)/).filter(Boolean);
    if (pieces.length > 1) {
      let resolvedAny = false;
      const results: Array<[TypeMatch, string]> = [];

      for (const piece of pieces) {
        // The seat comes off inside resolve() before the bare-number test, so
        // "75 SIC" reads as the 75 in a Learjet run rather than an unknown.
        const m = resolve(piece);

        if (m.kind === "type") {
          prefixes = familyPrefixes(m.type);
          resolvedAny = true;
        } else if (m.kind === "not-a-type") {
          // "SEL/MEL" resolves to two class ratings and nothing else — still
          // resolved, so the pieces are kept rather than the whole thrown back.
          resolvedAny = true;
        }
        results.push([m, piece]);
      }

      if (resolvedAny) {
        for (const [m, piece] of results) push(m, piece);
        continue;
      }
    }
    push(whole, part);
  }

  return { types, notTypes, unknown };
}
