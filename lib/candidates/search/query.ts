/**
 * Candidate search — the query language, the places it looks, and the patterns
 * it matches with. PURE: nothing here touches the database, so the server engine
 * (lib/candidates/search/engine.ts) and the page can both read it.
 *
 * WHY IT EXISTS. The box used to split what you typed on spaces and look for each
 * piece as a substring in a dozen fields at once. So "challenger 350" meant
 * "challenger somewhere AND 350 somewhere" — the 350 could come from a phone
 * number — and nothing could say WHERE to look. His ask of 2026-09-23: search
 * "challenger 350" anywhere EXCEPT the job title they applied to, so it shows who
 * has actually flown one. "Make it smart. Account for upper and lower case."
 *
 * THE LANGUAGE. Upper or lower case never matters, anywhere.
 *
 *   captain            a word matches at the START of a word: capt finds Captain,
 *                      and 350 never matches inside a phone number
 *   "first officer"    a phrase; spacing, hyphens and slashes are forgiven, so
 *                      "pc 12" finds PC-12 and "challenger 350" finds 300/350
 *   -pilatus           leave out anybody it matches; NOT pilatus is the same
 *   -"cabin attendant" leave out a PHRASE. Without the quotes the minus takes one
 *                      word, and the next is searched FOR (see the suggestion)
 *   cl350 OR g450      either one (a | works too). Plain words are ANDed, and a
 *                      typed AND is simply that
 *   resume:"cl 350"    look for this one only in that place; -jobs:captain
 *   challenger 350     an AIRCRAFT the app knows is recognised and searched under
 *                      every spelling of its type rating (CL-30, CL350, Challenger
 *                      300, BD-100 ...), because type-rated on one is typed on all.
 *                      Put it in quotes to search that exact spelling instead.
 *                      -challenger 350 leaves the whole aircraft out.
 *
 * PLACES. What you tick under "Search in" decides where every term is looked
 * for, unless a term names its own place. His example is simply every place
 * except "Jobs applied to".
 *
 * A LEFT-OUT TERM LOOKS EVERYWHERE, whatever is ticked, unless it names its own
 * place. Ticking decides where the EVIDENCE for a match may come from; leaving
 * somebody out is about the person. It used to look only in the ticked places,
 * and his first real exclusion (Sep 23: "CL30, but not anyone who says cabin
 * attendant", with Experience only) kept every cabin attendant whose resume said
 * "Corporate Flight Attendant" - the "Cabin Attendant" was in the job they applied
 * to, which Experience only does not tick. -resume:captain still leaves out only
 * by what is in a resume.
 */

import { normalizeAircraftType, TYPE_BY_DESIGNATOR } from "@/lib/candidates/aircraft-types";

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------

export type SearchPlace = "resume" | "application" | "flight" | "notes" | "jobs" | "profile" | "name";

export type SearchPlaceInfo = {
  id: SearchPlace;
  label: string;
  /** What is inside it, for the picker. */
  hint: string;
  /** The word that scopes one term to it: resume:"cl350". The first is the one shown in help. */
  prefixes: string[];
};

export const SEARCH_PLACES: SearchPlaceInfo[] = [
  {
    id: "resume",
    label: "Resumes & documents",
    hint: "Resumes, cover letters and every other uploaded document",
    prefixes: ["resume", "resumes", "cv", "doc", "docs", "document", "documents"]
  },
  {
    id: "application",
    label: "Applications",
    hint: "Signed pilot applications and Paycom applications, minus the position they applied for",
    prefixes: ["app", "apps", "application", "applications", "form", "forms"]
  },
  {
    id: "flight",
    label: "Flight data",
    hint: "Scanned hours, time in type, type ratings, certificates and medical",
    prefixes: ["flight", "hours", "rating", "ratings", "type", "types", "cert", "certs", "certificate", "certificates"]
  },
  { id: "notes", label: "Notes", hint: "Notes on their profile", prefixes: ["note", "notes"] },
  {
    id: "jobs",
    label: "Jobs applied to",
    hint: "The jobs they applied to, and the position written on their pilot application",
    prefixes: ["job", "jobs", "applied", "position"]
  },
  {
    id: "profile",
    label: "Title, tags & status",
    hint: "Current title, tags, stage, application status, source and owner",
    prefixes: ["title", "tag", "tags", "status", "stage", "source", "owner", "profile"]
  },
  { id: "name", label: "Name & contact", hint: "Name, email, phone and JazzHR ids", prefixes: ["name", "email", "phone", "contact", "id"] }
];

export const ALL_PLACES: SearchPlace[] = SEARCH_PLACES.map((place) => place.id);

/**
 * Everywhere a person describes their own experience — the "have they flown it"
 * question. Leaves out the jobs they applied to, their title, tags and status,
 * and their name.
 */
export const EXPERIENCE_PLACES: SearchPlace[] = ["resume", "application", "flight", "notes"];

const PLACE_BY_PREFIX = new Map<string, SearchPlace>(
  SEARCH_PLACES.flatMap((place) => place.prefixes.map((prefix) => [prefix, place.id] as const))
);

export function placeInfo(id: SearchPlace): SearchPlaceInfo {
  return SEARCH_PLACES.find((place) => place.id === id)!;
}

/**
 * The ?in= parameter. Accepts "resume,flight" or repeated params (a GET form of
 * checkboxes sends one per tick). Unknown names are dropped; nothing left means
 * everywhere, so a hand-edited URL can never search nowhere.
 */
export function parsePlaces(raw: string | string[] | null | undefined): SearchPlace[] {
  const list = (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  // The two one-click presets win over any ticks sent with them.
  if (list.includes("all")) return ALL_PLACES;
  if (list.includes("experience")) return EXPERIENCE_PLACES;
  const picked = ALL_PLACES.filter((place) => list.includes(place));
  return picked.length > 0 ? picked : ALL_PLACES;
}

/** The ?in= value for a set of places, or undefined for everywhere (the default). */
export function placesParam(places: SearchPlace[]): string | undefined {
  if (places.length === 0 || ALL_PLACES.every((place) => places.includes(place))) return undefined;
  return ALL_PLACES.filter((place) => places.includes(place)).join(",");
}

export function isEverywhere(places: SearchPlace[]): boolean {
  return placesParam(places) === undefined;
}

// ---------------------------------------------------------------------------
// Patterns
//
// ONE pattern string serves both engines: Postgres (~*, case-insensitive) and
// JavaScript (new RegExp(pattern, "gi")) — the database finds the people, the
// page highlights the words, and they cannot disagree about what matched. So
// only syntax both understand is used: [..] classes with \s, (?:...), and the
// look-around constraints (?<!...) and (?!...). Postgres has had look-behind
// since 9.6; this database runs 18.
// ---------------------------------------------------------------------------

/** Between two parts of a word or phrase: nothing, or the spacing and punctuation people put in. */
const SEP = "[\\s/._,'’-]*";
/** The start of a word: not straight after a letter or digit. */
const WORD_START = "(?<![a-z0-9])";

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Words an aircraft alias is glued out of ("kingair350", "grandcaravan"), so its
 * spelling can be pulled apart again and "King Air 350" found in a resume.
 */
const JOINED_WORDS = [
  "challenger", "citation", "gulfstream", "learjet", "phenom", "legacy", "praetor", "global",
  "express", "falcon", "hawker", "beechjet", "king", "air", "grand", "caravan", "honda", "jet", "westwind",
  "sovereign", "latitude", "longitude", "mustang", "ultra", "encore", "excel", "bravo", "galaxy", "astra",
  "dash", "metroliner", "metro", "brasilia", "bandeirante", "saab", "shorts", "boeing", "airbus", "pilatus",
  "cessna", "skyhawk", "skylane", "stationair", "saratoga", "cherokee", "six", "navajo", "chieftain", "baron",
  "cirrus", "embraer", "sikorsky", "diamond", "series", "plus", "chal"
].sort((a, b) => b.length - a.length);

function splitJoinedWords(run: string): string[] {
  const out: string[] = [];
  let rest = run;
  while (rest) {
    const word = JOINED_WORDS.find((candidate) => rest.startsWith(candidate));
    if (!word) return [run];
    out.push(word);
    rest = rest.slice(word.length);
  }
  return out;
}

/**
 * A spelling as a pattern: its letters and numbers in order, with the spacing
 * and punctuation between them forgiven — so "pc 12", "PC-12" and "PC12" are one
 * thing, and so are "challenger 350" and "Challenger-350".
 *
 * `slashList` lets a number stand at the end of a list written with slashes:
 * "Challenger 300/350" and "CL300/350" are how pilots write it, and a search for
 * the 350 should find them.
 */
function spell(text: string, opts: { slashList?: boolean; splitGlued?: boolean } = {}): { body: string; endsWithDigit: boolean } | null {
  const tokens = text
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const parts: string[] = [];
  let endsWithDigit = false;
  let previousWasLetters = false;
  for (const token of tokens) {
    for (const run of token.match(/[a-z]+|[0-9]+/g) ?? []) {
      if (/^[0-9]/.test(run)) {
        const lead = opts.slashList && previousWasLetters ? "(?:[0-9]+\\s*/\\s*)?" : "";
        parts.push(lead + run);
        endsWithDigit = true;
        previousWasLetters = false;
      } else {
        for (const word of opts.splitGlued ? splitJoinedWords(run) : [run]) parts.push(escapeRe(word));
        endsWithDigit = false;
        previousWasLetters = true;
      }
    }
  }
  if (parts.length === 0) return null;
  return { body: parts.join(SEP), endsWithDigit };
}

// ---------------------------------------------------------------------------
// Aircraft
// ---------------------------------------------------------------------------

/** Words that can sit next to an aircraft without being part of its name. */
const NOT_AIRCRAFT_WORDS = /^(pic|sic|captain|capt|first|officer|fo|f\/o|single|pilot|series|type|typed|rating|ratings|faa|icao|time|hours|hrs|in)$/i;

function keyOf(text: string): string {
  return text.toLowerCase().replace(/\+/g, "plus").replace(/[^a-z0-9]/g, "");
}

export type AircraftMatch = { type: string; name: string; spellings: string[] };

/**
 * Is this an aircraft the app knows? Only letters-and-numbers or known names —
 * never a bare number, because "500" on its own is far more often hours than a
 * Citation.
 */
export function aircraftIn(text: string): AircraftMatch | null {
  const key = keyOf(text);
  if (key.length < 2 || !/[a-z]/.test(key)) return null;
  if (text.split(/\s+/).some((word) => NOT_AIRCRAFT_WORDS.test(word))) return null;
  const match = normalizeAircraftType(text);
  if (match.kind !== "type") return null;
  const entry = TYPE_BY_DESIGNATOR.get(match.type);
  const seen = new Set<string>();
  const spellings: string[] = [];
  for (const candidate of [text, match.type, ...(entry?.aliases ?? [])]) {
    const k = keyOf(candidate);
    // A bare number ("3500", "650") in free text is anything, and one letter is nothing.
    if (k.length < 2 || /^[0-9]+$/.test(k) || seen.has(k)) continue;
    seen.add(k);
    spellings.push(candidate);
  }
  return { type: match.type, name: match.name, spellings };
}

function aircraftPattern(aircraft: AircraftMatch): string {
  const alternatives = new Set<string>();
  for (const spelling of aircraft.spellings) {
    const spelled = spell(spelling, { slashList: true, splitGlued: true });
    if (!spelled) continue;
    // Strict at the end: "cj" must not find "cjones", "g450" must not find "g4500".
    alternatives.add(spelled.body + (spelled.endsWithDigit ? "(?![0-9])" : "(?![a-z])"));
  }
  const list = [...alternatives].sort((a, b) => b.length - a.length);
  return `${WORD_START}(?:${list.join("|")})`;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export type SearchTermKind = "word" | "phrase" | "aircraft" | "number" | "email" | "phone";

export type SearchTerm = {
  /** 1 << index — how the engine reports which terms matched where. */
  bit: number;
  kind: SearchTermKind;
  /** As typed, for showing back. */
  text: string;
  negate: boolean;
  /** Its own place (resume:...), or null to use the places ticked for the search. */
  places: SearchPlace[] | null;
  aircraft: AircraftMatch | null;
  /** Case-insensitive regex source, valid in Postgres (~*) and JavaScript alike. */
  pattern: string;
  /** Lower-cased text for plain substring matching in email columns, or null. */
  emailNeedle: string | null;
  /** Digits for the phone columns (at least four), or null. */
  phoneDigits: string | null;
  /** Lower-cased prefix for the JazzHR ids, or null. */
  idPrefix: string | null;
};

export type ParsedSearch = {
  raw: string;
  /** Every term; bit = 1 << its index. */
  terms: SearchTerm[];
  /** Terms to find: every group must match, and any term in a group will do (OR). */
  groups: SearchTerm[][];
  /** Terms that leave somebody out. */
  exclude: SearchTerm[];
  /** True when there is nothing to find, only things to leave out. */
  excludeOnly: boolean;
  empty: boolean;
  /** What they probably meant, when the box reads one way and was likely meant another. See phraseSuggestion. */
  suggestion: SearchSuggestion | null;
};

export type SearchSuggestion = {
  /** The whole search, rewritten - ready to run. */
  query: string;
  /** The phrase it would leave out, for the sentence that offers it. */
  phrase: string;
  /** What the box did instead: the word it left out, and the words it searched for. */
  leftOut: string;
  required: string[];
};

type Token = {
  text: string;
  quoted: boolean;
  negate: boolean;
  places: SearchPlace[] | null;
  orBefore: boolean;
  /** Where it sat in the box, a leading minus or NOT included - so a suggestion can rewrite just this part. */
  start: number;
  end: number;
};

/** Postgres int bitmasks, and nobody needs more than this in one box. */
const MAX_TERMS = 24;

function tokenize(raw: string): Token[] {
  const out: Token[] = [];
  // Same length as raw, so the positions recorded below index the box as typed.
  const s = raw.replace(/[“”]/g, '"');
  let i = 0;
  let pendingOr = false;
  // A NOT waiting for the term it negates, and where it started.
  let pendingNot: number | null = null;
  while (i < s.length) {
    if (/\s/.test(s[i])) {
      i += 1;
      continue;
    }
    if (s[i] === "|") {
      pendingOr = true;
      i += 1;
      continue;
    }
    const start = i;
    let negate = false;
    if (s[i] === "-" && i + 1 < s.length && !/\s/.test(s[i + 1])) {
      negate = true;
      i += 1;
    }
    let places: SearchPlace[] | null = null;
    const scope = /^([a-z]+):(?=\S)/i.exec(s.slice(i));
    if (scope && PLACE_BY_PREFIX.has(scope[1].toLowerCase())) {
      places = [PLACE_BY_PREFIX.get(scope[1].toLowerCase())!];
      i += scope[0].length;
    }
    let text: string;
    let quoted = false;
    if (s[i] === '"') {
      const end = s.indexOf('"', i + 1);
      text = s.slice(i + 1, end === -1 ? s.length : end);
      i = end === -1 ? s.length : end + 1;
      quoted = true;
    } else {
      let j = i;
      while (j < s.length && !/\s/.test(s[j]) && s[j] !== '"') j += 1;
      text = s.slice(i, j);
      i = j;
    }
    text = text.trim();
    if (!text) continue;
    // The boolean words recruiters bring from LinkedIn and job boards, in
    // capitals like OR. Read as words, "cl30 NOT pilatus" would REQUIRE the
    // word "not" - and "AND" is in nearly every resume.
    if (!quoted && !negate && !places && text === "OR") {
      pendingOr = true;
      continue;
    }
    if (!quoted && !negate && !places && text === "AND") continue;
    if (!quoted && !negate && !places && text === "NOT") {
      pendingNot = start;
      continue;
    }
    out.push({ text, quoted, negate: negate || pendingNot !== null, places, orBefore: pendingOr, start: pendingNot ?? start, end: i });
    pendingOr = false;
    pendingNot = null;
  }
  return out;
}

type MergedToken = Token & { aircraft: AircraftMatch | null };

/** Is this word part of how the aircraft is written - "challenger" of a Challenger 350, not "pilatus" of a G450? */
function partOfName(word: string, aircraft: AircraftMatch): boolean {
  const key = keyOf(word);
  if (!key) return false;
  const aliases = TYPE_BY_DESIGNATOR.get(aircraft.type)?.aliases ?? [];
  return [aircraft.name, aircraft.type, ...aliases].some((spelling) => keyOf(spelling).includes(key));
}

/**
 * Pull neighbouring plain words together when they name an aircraft —
 * "challenger 350", "king air 350", "citation cj3" — longest first. A quoted
 * phrase means exactly that spelling, and an OR boundary is never crossed. The
 * FIRST word may carry a minus or a place, which then applies to the whole
 * aircraft: -challenger 350 leaves the Challenger 350 out, where splitting it
 * would leave out "challenger" and require a 350.
 */
function mergeAircraft(tokens: Token[]): MergedToken[] {
  const out: MergedToken[] = [];
  const plain = (t: Token | undefined) => Boolean(t && !t.quoted && !t.negate && !t.places);
  for (let i = 0; i < tokens.length; ) {
    let merged = false;
    for (let n = 3; n >= 2; n -= 1) {
      const run = tokens.slice(i, i + n);
      if (run.length < n || run[0].quoted || !run.slice(1).every(plain) || run.slice(1).some((t) => t.orBefore)) continue;
      const text = run.map((t) => t.text).join(" ");
      const aircraft = aircraftIn(text);
      if (!aircraft) continue;
      // Under a minus or a place, every word must be part of the aircraft's own
      // names. The reader is lenient - it drops maker words, so "pilatus g450"
      // reads as a G450 - which only widens a term to FIND a little, but would
      // flip "-pilatus g450" from "leave out Pilatus, find G450s" into "leave
      // out G450s".
      if ((run[0].negate || run[0].places) && !run.every((t) => partOfName(t.text, aircraft))) continue;
      out.push({ ...run[0], text, aircraft, end: run[n - 1].end });
      i += n;
      merged = true;
      break;
    }
    if (merged) continue;
    const token = tokens[i];
    out.push({ ...token, aircraft: token.quoted ? null : aircraftIn(token.text) });
    i += 1;
  }
  return out;
}

/**
 * "-cabin attendant" reads as: leave out "cabin", and FIND "attendant". That is
 * the standard reading (Google's too) and not what he meant on Sep 23 - his list
 * came back as nothing BUT attendants. A minus followed by plain words is offered
 * the quoted phrase, one click away. The search still runs as typed, because
 * "-pilatus captain" can mean exactly what it says.
 */
function phraseSuggestion(raw: string, tokens: MergedToken[]): SearchSuggestion | null {
  const plainWord = (t: MergedToken | undefined) =>
    Boolean(t && !t.quoted && !t.negate && !t.places && !t.orBefore && !t.aircraft && /[a-z]/i.test(t.text) && !t.text.includes("@"));
  for (let i = 0; i < tokens.length; i += 1) {
    const first = tokens[i];
    if (!first.negate || first.quoted || first.aircraft) continue;
    let j = i + 1;
    while (plainWord(tokens[j])) j += 1;
    if (j === i + 1) continue;
    // Stray single quotes are what -'cabin attendant' leaves on the words.
    const words = tokens.slice(i, j).map((t) => t.text.replace(/^['‘’]+|['‘’]+$/g, "")).filter(Boolean);
    const phrase = words.join(" ");
    const scope = first.places ? `${placeInfo(first.places[0]).prefixes[0]}:` : "";
    const query = `${raw.slice(0, first.start)}-${scope}"${phrase}"${raw.slice(tokens[j - 1].end)}`.replace(/\s+/g, " ").trim();
    return { query, phrase, leftOut: first.text, required: tokens.slice(i + 1, j).map((t) => t.text) };
  }
  return null;
}

function digitsOf(text: string): string {
  return text.replace(/\D/g, "");
}

function buildTerm(token: Token & { aircraft: AircraftMatch | null }, index: number): SearchTerm | null {
  const base = {
    bit: 1 << index,
    text: token.text,
    negate: token.negate,
    places: token.places,
    aircraft: token.aircraft,
    emailNeedle: null as string | null,
    phoneDigits: null as string | null,
    idPrefix: null as string | null
  };
  const lower = token.text.toLowerCase();

  if (token.aircraft) {
    return { ...base, kind: "aircraft", pattern: aircraftPattern(token.aircraft) };
  }
  if (!token.quoted && lower.includes("@")) {
    return { ...base, kind: "email", pattern: escapeRe(lower), emailNeedle: lower };
  }
  const digits = digitsOf(lower);
  if (!token.quoted && /^[\d\s().+-]+$/.test(lower) && digits.length >= 7) {
    // A phone number, however it is punctuated.
    return { ...base, kind: "phone", pattern: `(?<![0-9])${digits.split("").join("[\\s.()/+-]*")}(?![0-9])`, phoneDigits: digits };
  }
  if (!token.quoted && /^\d+$/.test(lower)) {
    // A number is a whole number: 350 finds CL350 and "350 hrs", never 3500 or a phone.
    return { ...base, kind: "number", pattern: `(?<![0-9])${lower}(?![0-9])`, phoneDigits: digits.length >= 4 ? digits : null, idPrefix: lower };
  }
  const spelled = spell(token.text, { slashList: token.quoted });
  if (!spelled) return null;
  return {
    ...base,
    kind: token.quoted ? "phrase" : "word",
    // The last word matches as the start of a word (capt finds Captain); a
    // number at the end must end there.
    pattern: WORD_START + spelled.body + (spelled.endsWithDigit ? "(?![0-9])" : ""),
    emailNeedle: token.quoted ? null : lower,
    phoneDigits: digits.length >= 4 && digits.length === lower.replace(/[\s().+-]/g, "").length ? digits : null,
    idPrefix: token.quoted ? null : lower
  };
}

export function parseSearch(raw: string): ParsedSearch {
  const tokens = mergeAircraft(tokenize(raw ?? "")).slice(0, MAX_TERMS);
  const suggestion = phraseSuggestion(raw ?? "", tokens);
  const terms: SearchTerm[] = [];
  const groups: SearchTerm[][] = [];
  const exclude: SearchTerm[] = [];
  for (const token of tokens) {
    const term = buildTerm(token, terms.length);
    if (!term) continue;
    terms.push(term);
    if (term.negate) {
      exclude.push(term);
    } else if (token.orBefore && groups.length > 0) {
      groups[groups.length - 1].push(term);
    } else {
      groups.push([term]);
    }
  }
  return {
    raw: raw ?? "",
    terms,
    groups,
    exclude,
    excludeOnly: groups.length === 0 && exclude.length > 0,
    empty: terms.length === 0,
    suggestion
  };
}

/**
 * The places a term is looked for in: its own, or the ones ticked for the search
 * - or, for a term that LEAVES people out, everywhere (see the header).
 */
export function placesFor(term: SearchTerm, places: SearchPlace[]): SearchPlace[] {
  return term.places ?? (term.negate ? ALL_PLACES : places);
}

// ---------------------------------------------------------------------------
// Highlighting — the same patterns, run in the browser's engine
// ---------------------------------------------------------------------------

export type TextSegment = { text: string; mark: boolean };

/** Split text into plain and matched runs for every positive term. */
export function markMatches(text: string, terms: SearchTerm[]): TextSegment[] {
  const ranges: Array<[number, number]> = [];
  for (const term of terms) {
    if (term.negate) continue;
    let re: RegExp;
    try {
      re = new RegExp(term.pattern, "gi");
    } catch {
      continue;
    }
    for (const match of text.matchAll(re)) {
      if (match.index === undefined || match[0].length === 0) continue;
      ranges.push([match.index, match.index + match[0].length]);
    }
  }
  if (ranges.length === 0) return [{ text, mark: false }];
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  const out: TextSegment[] = [];
  let at = 0;
  for (const [start, end] of merged) {
    if (start > at) out.push({ text: text.slice(at, start), mark: false });
    out.push({ text: text.slice(start, end), mark: true });
    at = end;
  }
  if (at < text.length) out.push({ text: text.slice(at), mark: false });
  return out;
}
