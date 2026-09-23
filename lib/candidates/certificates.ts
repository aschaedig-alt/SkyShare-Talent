/**
 * Certificates as a checklist — the reference list the Certificates card and the
 * Screening preview are drawn against.
 *
 * WHY THIS EXISTS. The scan stores certificates as one comma-separated line,
 * spelled however the document spelled it: the 309 stored values carried 206
 * different spellings on 2026-09-23 ("MULTI ENGINE LAND", "AMEL", "ME Land",
 * "ATP (MEL)"…). A recruiter checks a pilot against a fixed list, so the line
 * is read into that list here — each line seen, covered, or not seen.
 *
 * WHAT IT DOES NOT DO: it never rewrites stored data on its own. Like the Type
 * column's lib/candidates/aircraft-types.ts, everything below runs when the
 * value is READ, so a wrong rule is fixed by editing this file, not by
 * re-migrating. The one writer is a scan (planCertificatesFromForm below).
 *
 * THE LIST mirrors the eleven boxes on SkyShare's own Pilot Application V4,
 * plus CFII (resumes carry it; the form has no box for it) and the FCC radio
 * permit, a standard requirement on the pilot job template. Mechanics get
 * Airframe / Powerplant / IA instead. All four were his calls on 2026-09-23.
 *
 * GREY NEVER MEANS "DOES NOT HOLD". A line the scan did not see may simply not
 * be written down anywhere. Only the signed application's unticked box is a
 * statement by the candidate, and even that reads "not ticked".
 */

import { parseTypeRatings } from "@/lib/candidates/aircraft-types";

export type CertId =
  | "private"
  | "commercial"
  | "atp"
  | "atp_ctp"
  | "atp_written"
  | "student"
  | "instrument"
  | "sel"
  | "mel"
  | "ses"
  | "mes"
  | "cfi"
  | "cfii"
  | "mei"
  | "fcc"
  | "airframe"
  | "powerplant"
  | "ia";

export type CertItem = {
  id: CertId;
  /** On the card. */
  label: string;
  /** In the 330px Screening preview. */
  short: string;
  /** Tooltip — nobody outside the cockpit reads "MEL". */
  full: string;
  /**
   * How the tick-box editor writes the line back. Each must read back as this
   * same id through normalizeCertificates, or a saved edit would lose it.
   */
  text: string;
};

export const CERT_ITEMS: Record<CertId, CertItem> = {
  private: { id: "private", label: "Private", short: "PVT", full: "Private pilot certificate", text: "Private" },
  commercial: { id: "commercial", label: "Commercial", short: "COMM", full: "Commercial pilot certificate", text: "Commercial" },
  atp: { id: "atp", label: "ATP", short: "ATP", full: "Airline Transport Pilot certificate", text: "ATP" },
  atp_ctp: { id: "atp_ctp", label: "ATP-CTP course", short: "CTP", full: "ATP Certification Training Program completed", text: "ATP-CTP completed" },
  atp_written: { id: "atp_written", label: "ATP written", short: "WRITTEN", full: "ATP knowledge test passed", text: "ATP written" },
  student: { id: "student", label: "Student pilot", short: "STUDENT", full: "Student pilot certificate", text: "Student" },
  instrument: { id: "instrument", label: "Instrument", short: "IR", full: "Instrument rating (airplane)", text: "Instrument Rating" },
  sel: { id: "sel", label: "Single-engine land", short: "SEL", full: "Airplane single-engine land", text: "Single Engine Land" },
  mel: { id: "mel", label: "Multi-engine land", short: "MEL", full: "Airplane multi-engine land", text: "Multi Engine Land" },
  ses: { id: "ses", label: "Single-engine sea", short: "SES", full: "Airplane single-engine sea", text: "Single Engine Sea" },
  mes: { id: "mes", label: "Multi-engine sea", short: "MES", full: "Airplane multi-engine sea", text: "Multi Engine Sea" },
  cfi: { id: "cfi", label: "CFI", short: "CFI", full: "Certificated flight instructor", text: "CFI" },
  cfii: { id: "cfii", label: "CFII", short: "CFII", full: "Instrument instructor rating", text: "CFII" },
  mei: { id: "mei", label: "MEI", short: "MEI", full: "Multi-engine instructor rating", text: "MEI" },
  fcc: { id: "fcc", label: "FCC radio permit", short: "FCC", full: "FCC radiotelephone operator permit", text: "FCC Radio Permit" },
  airframe: { id: "airframe", label: "Airframe", short: "AIRFRAME", full: "Mechanic certificate, airframe rating", text: "Airframe" },
  powerplant: { id: "powerplant", label: "Powerplant", short: "POWERPLANT", full: "Mechanic certificate, powerplant rating", text: "Powerplant" },
  ia: { id: "ia", label: "IA", short: "IA", full: "Inspection Authorization", text: "Inspection Authorization" }
};

export type CertGroup = {
  id: string;
  label: string;
  /** Row label in the compact variant. */
  short: string;
  family: "pilot" | "mechanic";
  items: CertId[];
  /** Lines shown only when seen — sea ratings are rare here and a grey line for everyone would be noise. */
  onlyWhenSeen?: CertId[];
};

/**
 * Display order. "Toward ATP" is only drawn when there is no ATP — for an ATP
 * holder the course and the written are history, and two grey lines would read
 * as something missing.
 */
export const CERT_GROUPS: CertGroup[] = [
  { id: "certificate", label: "Certificate", short: "Cert", family: "pilot", items: ["private", "commercial", "atp"] },
  { id: "toward-atp", label: "Toward ATP", short: "To ATP", family: "pilot", items: ["atp_ctp", "atp_written"] },
  { id: "ratings", label: "Ratings", short: "Rating", family: "pilot", items: ["instrument", "sel", "mel"], onlyWhenSeen: ["ses", "mes"] },
  { id: "instructor", label: "Instructor", short: "Instr", family: "pilot", items: ["cfi", "cfii", "mei"] },
  { id: "radio", label: "Radio", short: "Radio", family: "pilot", items: ["fcc"] },
  { id: "mechanic", label: "Mechanic", short: "Mech", family: "mechanic", items: ["airframe", "powerplant", "ia"] }
];

/**
 * Covered, not seen: holding the key implies the listed lines. An ATP carries
 * the privileges of a commercial certificate with an instrument rating (14 CFR
 * 61.167); CFII and MEI are ratings on a flight instructor certificate, so they
 * cannot exist without a CFI. Shown hollow — it was never written down.
 */
export const IMPLIES: Partial<Record<CertId, CertId[]>> = {
  atp: ["commercial", "private", "instrument"],
  commercial: ["private"],
  cfii: ["cfi"],
  mei: ["cfi"]
};

/**
 * The boxes the Pilot Application asks about. When a signed application has
 * been read, its ticks decide these lines and a resume can neither add nor
 * remove them; a resume only adds what the form does not ask (his call,
 * 2026-09-23).
 */
export const FORM_ASKED: ReadonlySet<CertId> = new Set<CertId>([
  "commercial",
  "student",
  "private",
  "cfi",
  "mei",
  "instrument",
  "sel",
  "mel",
  "atp_ctp",
  "atp",
  "atp_written"
]);

const PILOT_IDS: ReadonlySet<CertId> = new Set<CertId>([
  "private", "commercial", "atp", "atp_ctp", "atp_written", "student",
  "instrument", "sel", "mel", "ses", "mes", "cfi", "cfii", "mei"
]);
const MECHANIC_IDS: ReadonlySet<CertId> = new Set<CertId>(["airframe", "powerplant", "ia"]);

// ---------------------------------------------------------------------------
// Reading a stored value
// ---------------------------------------------------------------------------

/** Recognised, but not a line on the list (a glider rating, Part 107, an expired CFI…). */
export type CertExtra = { label: string; raw: string };

type TokenRead = { raw: string; ids: CertId[]; extra?: CertExtra };

export type CertificatesRead = {
  found: Set<CertId>;
  /** The words each line was read from — the tooltip, so a green line can be checked. */
  seenAs: Map<CertId, string[]>;
  extras: CertExtra[];
  /** Not recognised at all. Shown exactly as written, never dropped. */
  asWritten: string[];
  tokens: TokenRead[];
};

/**
 * Split on commas and semicolons that are NOT inside brackets, so
 * "A&P (January 17, 2026)" stays one entry instead of leaving a stray "2026)".
 */
export function splitCertificates(value: string | null | undefined): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of value ?? "") {
    if (ch === "(") depth += 1;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if ((ch === "," || ch === ";") && depth === 0) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((s) => s.trim()).filter(Boolean);
}

function tidy(raw: string): string {
  return raw.replace(/[‒-―]/g, "-").replace(/\s+/g, " ").trim();
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])([a-z]*)/g, (_m, a: string, b: string) => a.toUpperCase() + b)
    .replace(/\b(Fcc|Faa|Atp|Ctp|Cfi|Cfii|Mei|Ia|Ifr|Asel|Amel|Mel|Sel|Anac|Uas|Ndt|Cdl|Epa|Hvac|Pt|Ncatt|Agi|Ppgi|A&p)\b/g, (m) =>
      m.toUpperCase()
    );
}

/**
 * One entry to the lines it names. The ORDER of the checks is the point: each
 * guard below exists because the plain reading of a real entry was wrong.
 */
function readEntry(raw: string): TokenRead {
  const t = tidy(raw);
  // "(IF NOT ATP)" is the Pilot Application's own label text, never a claim.
  let s = ` ${t.toUpperCase().replace(/\(IF NOT ATP\)/g, " ")} `;
  const ids = new Set<CertId>();
  const add = (...x: CertId[]) => x.forEach((id) => ids.add(id));
  let sideExtra: CertExtra | undefined;

  // Things that must never turn a line green.
  if (/\b(ANAC|EASA|JAA|DGCA|CASA|TRANSPORT CANADA|ICAO)\b/.test(s)) {
    return { raw, ids: [], extra: { label: `${titleCase(t)} (non-FAA)`, raw } };
  }
  if (/\b(EXPIRED|LAPSED|PENDING|IN PROGRESS|STUDYING|WORKING TOWARDS?)\b/.test(s)) {
    return { raw, ids: [], extra: { label: titleCase(t), raw } };
  }
  if (/HELICOPTER|ROTORCRAFT/.test(s)) {
    // A helicopter-only entry says nothing about airplane lines.
    if (!/AIRPLANE/.test(s)) return { raw, ids: [], extra: { label: titleCase(t), raw } };
    s = s.replace(/HELICOPTER|ROTORCRAFT/g, " ");
    sideExtra = { label: "Helicopter", raw };
  }

  // Steps toward an ATP come off BEFORE the ATP check, so "ATP/CTP COMPLETED"
  // and "ATP WRITTEN" are never read as the certificate itself. 39 values said
  // "ATP/CTP COMPLETED" on Sep 23, and Compare, splitting on the slash, showed
  // 19 of them an "ATP" chip they do not have (see certificateChips).
  if (/\bATP\s*[/-]?\s*CTP\b|\bCTP\b/.test(s)) {
    add("atp_ctp");
    s = s.replace(
      /\bATP\s*[/-]?\s*CTP\b(\s*(COURSE\s*)?(COMPLETED|COMPLETION|COMPLETE))?|\bCTP\b(\s*(COURSE\s*)?(COMPLETED|COMPLETION|COMPLETE))?/g,
      " "
    );
  }
  if (/\bWRITTEN\b/.test(s)) {
    add("atp_written");
    s = s.replace(/\b(ATP\s*)?WRITTEN(\s*(COMPLETED|COMPLETE|PASSED))?/g, " ");
  }

  // Inside an instructor entry, class and instrument words are INSTRUCTOR
  // ratings: "Flight instructor - airplane single & multi-engine" is CFI + MEI,
  // not the pilot's own SEL/MEL.
  if (/(CERTIFI(ED|CATED)\s+)?FLIGHT INSTRUCTOR|MULTI[\s-]*ENGINE INSTRUCTOR|\bCFI(-?I{1,2})?\b|\bMEI\b/.test(s)) {
    if (/\bCFII\b|\bCFI-I\b|\bCFI\/II\b|INSTRUCTOR\b.*\bINSTRUMENT\b/.test(s)) add("cfii");
    if (/\bMEI\b|MULTI[\s-]*ENGINE INSTRUCTOR|INSTRUCTOR\b.*\bMULTI[\s-]*ENGINE/.test(s)) add("mei");
    if (/\bCFI\b|FLIGHT INSTRUCTOR/.test(s)) add("cfi");
    return { raw, ids: [...ids] };
  }

  if (/\bATP\b|AIRLINE TRANSPORT/.test(s)) add("atp");
  if (/\bCOMMERCIAL\b|\bCPL\b/.test(s)) add("commercial");
  if (/\bPRIVATE\b|\bPPL\b/.test(s)) add("private");
  if (/\bSTUDENT\b/.test(s)) add("student");

  if (/\bINSTRUMENT\b|\bIFR\b|\bIR\b/.test(s)) add("instrument");
  if (/SINGLE[\s-]*ENGINE[\s-]*SEA|\bASES\b|\bSES\b|LAND\s*(&|AND)\s*SEA/.test(s)) add("ses");
  if (/MULTI[\s-]*ENGINE[\s-]*SEA|\bAMES\b|\bMES\b/.test(s)) add("mes");
  if (/\bASEL\b|\bSEL\b|SINGLE[\s-]*ENGINE(?![\s-]*SEA)|SINGLE\s*(&|AND)\s*MULTI/.test(s)) add("sel");
  if (/\bAMEL\b|\bMEL\b|MULTI[\s-]*ENGINE(?![\s-]*SEA)|\bME LAND\b/.test(s)) add("mel");

  if (/\bA\s*&\s*P\b|AIRFRAMES?\s*(&|AND)\s*POWER\s*-?\s*PLANTS?/.test(s)) add("airframe", "powerplant");
  if (/AIRFRAME/.test(s)) add("airframe");
  if (/POWER\s*-?\s*PLANT/.test(s)) add("powerplant");
  if (/INSPECT(ION|OR) AUTHORI[SZ]ATION|\(IA\)|\bIA\b/.test(s)) add("ia");

  // Any FCC radiotelephone operator licence or permit — restricted, general
  // (GROL) or unstated. The card's tooltip keeps the exact words, so a GROL is
  // never passed off as the restricted permit.
  if (/\bFCC\b|RADIO\s*\/?\s*-?\s*TELEPHONE|RADIO OPERATOR/.test(s)) add("fcc");

  if (ids.size > 0) return { raw, ids: [...ids], extra: sideExtra };

  const qualifier = (/\(([^)]+)\)/.exec(t)?.[1] ?? "").toLowerCase();
  const code = /\b(AGI|BGI|IGI)\b/.exec(s)?.[1] ?? "";
  // A null label keeps the candidate's own wording, for families where two
  // different things would otherwise collapse into one chip.
  const named: Array<[RegExp, string | null]> = [
    [/MEDICAL/, /FIRST/.test(s) ? "First-class medical" : "Medical"],
    [/PART 107|REMOTE PILOT|\bUAS\b/, "Remote pilot (Part 107)"],
    [/GLIDER/, "Glider"],
    [/FLIGHT ENGINEER|\bFE\b/, qualifier ? `Flight engineer (${qualifier})` : "Flight engineer"],
    [/TAILWHEEL/, "Tailwheel endorsement"],
    [/HIGH[\s-]*PERFORMANCE/, "High-performance endorsement"],
    [/\bCOMPLEX\b/, "Complex endorsement"],
    [/CHECK AIRMAN/, "Check airman"],
    [/\bAGI\b|\bBGI\b|\bIGI\b|GROUND INSTRUCTOR/, code ? `Ground instructor (${code})` : "Ground instructor"],
    [/REPAIRMAN/, "Repairman certificate"],
    [/NCATT|AVIONICS|AVIATION ELECTRONIC/, null],
    [/\bNDT\b|EDDY CURRENT|X-RAY/, null]
  ];
  for (const [re, label] of named) {
    if (re.test(s)) return { raw, ids: [], extra: { label: label ?? titleCase(t), raw } };
  }
  return { raw, ids: [] };
}

/** Read a stored certificates value into lines, extras and leftovers. */
export function normalizeCertificates(value: string | null | undefined): CertificatesRead {
  const found = new Set<CertId>();
  const seenAs = new Map<CertId, string[]>();
  const extras: CertExtra[] = [];
  const asWritten: string[] = [];
  const tokens: TokenRead[] = [];
  for (const raw of splitCertificates(value)) {
    const entry = readEntry(raw);
    tokens.push(entry);
    for (const id of entry.ids) {
      found.add(id);
      const words = seenAs.get(id) ?? [];
      if (!words.includes(tidy(raw))) words.push(tidy(raw));
      seenAs.set(id, words);
    }
    if (entry.extra && !extras.some((e) => e.label === entry.extra!.label)) extras.push(entry.extra);
    if (entry.ids.length === 0 && !entry.extra && !asWritten.includes(tidy(raw))) asWritten.push(tidy(raw));
  }
  return { found, seenAs, extras, asWritten, tokens };
}

/** Same lines, same extras, same leftovers — spelling and order aside. */
export function sameCertificates(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizeCertificates(a);
  const y = normalizeCertificates(b);
  const ids = (r: CertificatesRead) => [...r.found].sort().join("|");
  const words = (list: string[]) => list.map((w) => w.toUpperCase()).sort().join("|");
  return (
    ids(x) === ids(y) &&
    words(x.extras.map((e) => e.label)) === words(y.extras.map((e) => e.label)) &&
    words(x.asWritten) === words(y.asWritten)
  );
}

/** Which seen line covers this one, if any. */
function coveredBy(found: Set<CertId>, id: CertId): CertId | null {
  for (const [key, implied] of Object.entries(IMPLIES) as Array<[CertId, CertId[]]>) {
    if (found.has(key) && implied.includes(id)) return key;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The signed Pilot Application's ticks, and what a re-read may write
// ---------------------------------------------------------------------------

/**
 * The evidence line a Pilot Application read leaves on the certificates row.
 * The card reads it back to say where each line came from, and it carries the
 * old value when a re-read reopened one a person had marked.
 */
export const FORM_TICKS_PREFIX = "Ticked on the signed Pilot Application: ";
const ALSO_MARK = " | Also in other documents: ";
const WAS_CONFIRMED_MARK = " | Was confirmed as: ";
const WAS_DISMISSED_MARK = " | Was dismissed: ";

export function formTicksEvidence(
  ticked: string[],
  also: string[] = [],
  was?: { status: string; value: string | null }
): string {
  let line = `${FORM_TICKS_PREFIX}${ticked.join(" · ")}`;
  if (also.length > 0) line += `${ALSO_MARK}${also.join("; ")}`;
  if (was) line += `${was.status === "DISMISSED" ? WAS_DISMISSED_MARK : WAS_CONFIRMED_MARK}${was.value ?? ""}`;
  return line;
}

export type CertificatesEvidence = {
  ticked: string[];
  also: string[];
  was: { status: "CONFIRMED" | "DISMISSED"; value: string } | null;
};

export function readCertificatesEvidence(snippet: string | null | undefined): CertificatesEvidence | null {
  if (!snippet || !snippet.startsWith(FORM_TICKS_PREFIX)) return null;
  let rest = snippet.slice(FORM_TICKS_PREFIX.length);
  let was: CertificatesEvidence["was"] = null;
  for (const [mark, status] of [[WAS_CONFIRMED_MARK, "CONFIRMED"], [WAS_DISMISSED_MARK, "DISMISSED"]] as const) {
    const at = rest.indexOf(mark);
    if (at >= 0) {
      was = { status, value: rest.slice(at + mark.length) };
      rest = rest.slice(0, at);
      break;
    }
  }
  let also: string[] = [];
  const alsoAt = rest.indexOf(ALSO_MARK);
  if (alsoAt >= 0) {
    also = rest.slice(alsoAt + ALSO_MARK.length).split("; ").map((s) => s.trim()).filter(Boolean);
    rest = rest.slice(0, alsoAt);
  }
  const ticked = rest.split(" · ").map((s) => s.trim()).filter(Boolean);
  return { ticked, also, was };
}

/**
 * The ticked boxes, plus only what the other value adds that the form does not
 * ask about (CFII, sea, the FCC permit, extras, anything unrecognised).
 *
 * An entry that mixes both — "CFI/II/MEI" — keeps only its non-form part, as
 * the line's plain name ("CFII"): letting it through whole would let a resume
 * re-tick the CFI and MEI boxes the form left empty.
 */
export function mergeFormAndScan(ticked: string[], other: string | null | undefined): { value: string; kept: string[] } {
  const parts = [...ticked];
  const have = new Set(normalizeCertificates(ticked.join(", ")).found);
  const kept: string[] = [];
  const keep = (text: string) => {
    if (!text || [...parts, ...kept].some((p) => p.toUpperCase() === text.toUpperCase())) return;
    kept.push(text);
  };

  for (const entry of normalizeCertificates(other).tokens) {
    const outside = entry.ids.filter((id) => !FORM_ASKED.has(id));
    if (entry.ids.length === 0) {
      keep(tidy(entry.raw));
    } else if (outside.length === entry.ids.length) {
      if (outside.some((id) => !have.has(id))) keep(tidy(entry.raw));
      outside.forEach((id) => have.add(id));
    } else {
      for (const id of outside) {
        if (!have.has(id)) keep(CERT_ITEMS[id].text);
        have.add(id);
      }
      if (entry.extra) keep(entry.extra.label);
    }
  }
  return { value: [...parts, ...kept].join(", "), kept };
}

export type ExistingCertificates = { valueText: string | null; status: string; sourceSnippet?: string | null } | null;

export type CertificatesOutcome =
  | "new"
  | "changed"
  | "same"
  | "reopen-confirmed"
  | "reopen-dismissed"
  | "keep-confirmed"
  | "keep-dismissed";

export type CertificatesPlan =
  | { write: false; outcome: "keep-confirmed" | "keep-dismissed"; valueText: string }
  | { write: true; outcome: Exclude<CertificatesOutcome, "keep-confirmed" | "keep-dismissed">; valueText: string; sourceSnippet: string };

/**
 * What a read of the signed Pilot Application may do to the stored certificates
 * value. Shared by the Scan docs route and scripts/bulk-scan-metrics.ts so the
 * button and the bulk re-read cannot disagree.
 *
 * A value a person already marked is NOT off limits here, and only here (his
 * call, 2026-09-23 — "why can't I rescan an item that's already been marked"):
 *   - the lines the form asks about come from its ticks, even where the person
 *     accepted something else;
 *   - whatever else the marked value says (CFII, sea, FCC, extras) is kept, since
 *     a person may have added it by hand;
 *   - if that comes to the same list, nothing is written;
 *   - otherwise the new list goes back to SUGGESTED with the old value on the
 *     evidence line, so the reviewer sees what changed and one click accepts.
 * Every other metric keeps the rule of never overwriting a person's decision.
 *
 * `scan` is this scan's own reading (the model's list), or null when there was
 * none; an unmarked row falls back to its stored value for the extras.
 */
export function planCertificatesFromForm(
  ticked: string[],
  scan: string | null | undefined,
  existing: ExistingCertificates
): CertificatesPlan {
  const marked = existing && (existing.status === "CONFIRMED" || existing.status === "DISMISSED") ? existing : null;
  const base = marked ? marked.valueText : scan ?? existing?.valueText ?? null;
  const { value, kept } = mergeFormAndScan(ticked, base);

  if (marked) {
    const confirmed = marked.status === "CONFIRMED";
    if (sameCertificates(value, marked.valueText)) {
      return { write: false, outcome: confirmed ? "keep-confirmed" : "keep-dismissed", valueText: marked.valueText ?? "" };
    }
    return {
      write: true,
      outcome: confirmed ? "reopen-confirmed" : "reopen-dismissed",
      valueText: value,
      sourceSnippet: formTicksEvidence(ticked, kept, { status: marked.status, value: marked.valueText })
    };
  }
  const outcome = !existing ? "new" : sameCertificates(value, existing.valueText) ? "same" : "changed";
  // A value a re-read already reopened is still waiting for its reviewer: keep
  // its "was confirmed as" note, or a second run (a small batch, then the rest)
  // would wipe the one line that says what the person had decided.
  const was = readCertificatesEvidence(existing?.sourceSnippet)?.was ?? undefined;
  return { write: true, outcome, valueText: value, sourceSnippet: formTicksEvidence(ticked, kept, was) };
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

export type LineState = "seen" | "covered" | "none";

export type ChecklistLine = {
  item: CertItem;
  state: LineState;
  /** Label of the line that covers this one, for "· by ATP". */
  coveredBy?: string;
  /** Why it is that colour — the tooltip. */
  why: string;
};

export type ChecklistGroupView = { group: CertGroup; lines: ChecklistLine[] };

export type ChecklistView = {
  groups: ChecklistGroupView[];
  /** Everything that is not a line on the shown lists. asWritten = shown exactly as written. */
  also: Array<{ label: string; raw: string; asWritten: boolean }>;
  /** Main lines seen / covered / shown — "Toward ATP" and sea lines are not counted. */
  seen: number;
  covered: number;
  total: number;
  /** Where the lines came from: a person, the signed application's ticks, or the scan's reading of text. */
  source: "person" | "form" | "scan";
  evidence: CertificatesEvidence | null;
  /** Ids seen, including any read from Type Ratings — the tick-box editor starts from these. */
  found: Set<CertId>;
  families: Array<"pilot" | "mechanic">;
};

export type ChecklistInput = {
  /** valueText of the certificates metric. */
  certificates: string | null | undefined;
  /** valueText of the type_ratings metric. Its class and instructor ratings count; aircraft do not. */
  typeRatings?: string | null;
  /** sourceSnippet of the certificates metric. */
  evidence?: string | null;
  /** Status of the certificates metric. */
  status?: string | null;
};

function quote(words: string[] | undefined): string {
  return (words ?? []).map((w) => `“${w}”`).join(", ");
}

export function buildChecklist(input: ChecklistInput): ChecklistView {
  const read = normalizeCertificates(input.certificates);
  const evidence = readCertificatesEvidence(input.evidence);
  const person = input.status === "CONFIRMED";
  const tickedIds = evidence ? normalizeCertificates(evidence.ticked.join(", ")).found : new Set<CertId>();

  // The scan sometimes files ratings under Type Ratings instead ("SEL/MEL, CFI,
  // MEI, CFII") — 16 of 122 values did on 2026-09-23. Those count here; the
  // aircraft stay on the Type Ratings card. Where the signed application was
  // read, its ticks have already decided the lines it asks about.
  if (input.typeRatings) {
    const notTypes = parseTypeRatings(input.typeRatings).notTypes.map((entry) => entry.raw);
    const fromTypes = normalizeCertificates(notTypes.join(", "));
    for (const id of fromTypes.found) {
      if (read.found.has(id) || (evidence && FORM_ASKED.has(id))) continue;
      read.found.add(id);
      read.seenAs.set(id, (fromTypes.seenAs.get(id) ?? []).map((w) => `${w} (under Type Ratings)`));
    }
  }

  const found = read.found;
  const families: Array<"pilot" | "mechanic"> = [];
  if ([...found].some((id) => PILOT_IDS.has(id))) families.push("pilot");
  if ([...found].some((id) => MECHANIC_IDS.has(id))) families.push("mechanic");

  const lineFor = (id: CertId): ChecklistLine => {
    const item = CERT_ITEMS[id];
    if (found.has(id)) {
      const why = tickedIds.has(id) ? "Ticked on the signed Pilot Application" : `Seen: ${quote(read.seenAs.get(id))}`;
      return { item, state: "seen", why };
    }
    const by = coveredBy(found, id);
    if (by) {
      const label = CERT_ITEMS[by].label;
      return { item, state: "covered", coveredBy: label, why: `Covered: not written, but ${label} includes it` };
    }
    let why = "Not seen on the scan. They may still hold it.";
    if (person) why = "Not on the confirmed list. Not proof they don't hold it.";
    else if (evidence && FORM_ASKED.has(id)) why = "Not ticked on the signed Pilot Application";
    else if (evidence) why = "Not seen. The Pilot Application doesn't ask this and no other document mentions it.";
    return { item, state: "none", why };
  };

  const groups: ChecklistGroupView[] = [];
  const shown = new Set<CertId>();
  let seen = 0;
  let covered = 0;
  let total = 0;
  for (const group of CERT_GROUPS) {
    if (!families.includes(group.family)) continue;
    if (group.id === "toward-atp" && found.has("atp") && !group.items.some((id) => found.has(id))) continue;
    const ids = [...group.items, ...(group.onlyWhenSeen ?? []).filter((id) => found.has(id))];
    const lines = ids.map(lineFor);
    ids.forEach((id) => shown.add(id));
    if (group.id !== "toward-atp") {
      for (const line of lines) {
        if (group.onlyWhenSeen?.includes(line.item.id)) continue;
        total += 1;
        if (line.state === "seen") seen += 1;
        if (line.state === "covered") covered += 1;
      }
    }
    groups.push({ group, lines });
  }

  // Nothing seen is hidden: a line with no list on show (a mechanic's FCC
  // licence, a student certificate) joins the extras, in the words it was read from.
  const also: ChecklistView["also"] = [];
  for (const id of found) {
    if (shown.has(id)) continue;
    const words = read.seenAs.get(id) ?? [];
    also.push({ label: id === "student" ? CERT_ITEMS.student.label : words[0] ?? CERT_ITEMS[id].label, raw: words.join(", "), asWritten: false });
  }
  for (const extra of read.extras) also.push({ label: extra.label, raw: extra.raw, asWritten: false });
  for (const words of read.asWritten) also.push({ label: words, raw: words, asWritten: true });

  return {
    groups,
    also,
    seen,
    covered,
    total,
    source: person ? "person" : evidence ? "form" : "scan",
    evidence,
    found,
    families
  };
}

/** "7 of 10 seen", for a card header. */
export function checklistCount(view: ChecklistView): string {
  if (view.total === 0) return "";
  return `${view.seen} of ${view.total} seen${view.covered ? ` · ${view.covered} covered` : ""}`;
}

/** Every line in display order, then the student certificate, which has no list of its own. */
const LIST_ORDER: CertId[] = [...CERT_GROUPS.flatMap((g) => [...g.items, ...(g.onlyWhenSeen ?? [])]), "student"];

/**
 * The value as short chips for a list view (Compare): each line it names, in
 * list order and by its plain name, then the extras, then anything
 * unrecognised as written. Two spellings of one line make one chip, and
 * "ATP/CTP COMPLETED" is the course, never an ATP — Compare used to split it on
 * the slash and show an "ATP" chip, and match the ATP filter, for 19 people
 * without one on Sep 23; the re-read of the signed applications would have
 * made that 82 of the 333 it re-reads.
 */
export function certificateChips(value: string | null | undefined): string[] {
  const read = normalizeCertificates(value);
  return [
    ...new Set([
      ...LIST_ORDER.filter((id) => read.found.has(id)).map((id) => CERT_ITEMS[id].label),
      ...read.extras.map((extra) => extra.label),
      ...read.asWritten
    ])
  ];
}

/**
 * The tick-box editor's result, written back as plain text the reader above
 * understands: ticked lines in list order by their canonical names, then the
 * "also seen" text exactly as the person typed it.
 */
export function serializeCertificates(ticked: Iterable<CertId>, alsoText: string): string {
  const on = new Set(ticked);
  const parts = LIST_ORDER.filter((id) => on.has(id)).map((id) => CERT_ITEMS[id].text);
  for (const entry of splitCertificates(alsoText)) {
    if (!parts.some((p) => p.toUpperCase() === entry.toUpperCase())) parts.push(entry);
  }
  return parts.join(", ");
}
