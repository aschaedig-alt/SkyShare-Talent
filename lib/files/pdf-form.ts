/**
 * Read a PDF as a FORM rather than as a wall of text.
 *
 * WHY THIS EXISTS. lib/files/pdf-text.ts flattens a PDF to a single string,
 * which is right for search but destroys the one thing a form is made of: the
 * pairing between a label and the value printed next to it. On the SkyShare
 * intake forms every label prints first and every value prints afterwards in a
 * separate run, so the flattened text looks like this:
 *
 *   ...TOTAL INSTRUMENT: ... 4 4 4 4 Zachery Davis Katy TX 500 645 04/30/26
 *   77494 3000 2500 1175 440 1700 530 320 1380
 *
 * and on some files the values fuse with no separator at all
 * ("852551566138095488451000+129130" — a 1,566-hour total time is in there and
 * no regex can pull it out). That is why extracting hours needed an LLM.
 *
 * pdf.js (via unpdf, already a dependency) will hand back every text item WITH
 * its x/y position. Group items into visual rows and the form reads the way a
 * human sees it: a label ending in ":" or "?" pairs with the value immediately
 * to its right. No inference, no model call, no per-candidate cost — and more
 * accurate than a model, because there is nothing to guess.
 *
 * The AcroForm route (pdf.getFieldObjects) is NOT usable: these are Adobe Sign
 * documents and the signature flattens the live form fields away. Checked on
 * three real files, all three returned nothing.
 *
 * SERVER ONLY — dynamically imports unpdf.
 */

export type FormCell = { text: string; x: number; /** Rendered font size, for header detection. */ size: number };
export type FormRow = { page: number; y: number; cells: FormCell[] };

/** Rows within this many points of each other are the same visual line. */
const ROW_TOLERANCE = 3;

/**
 * Repeating page chrome. Stripped before pairing because it interleaves between
 * fields ("Multi-engine time 130 Page 3 of5Generated: (06/19/2026 9:57 AM)
 * SKYSHARE Payroll Profile: 16856 Jet time 95") and carries numbers of its own
 * that would otherwise be read as answers.
 */
const FURNITURE = [
  /^Page \d+ of\s*\d*$/i,
  /^\d+$/, // the orphaned page number that "Page 6 of" leaves behind
  /^Generated:/i,
  /^SKYSHARE$/i,
  /^Payroll Profile:/i,
  /^-- \d+ of \d+ --$/,
  /^PILOT APPLICATION \| V\d/i
];

function isFurniture(text: string, cellCount: number): boolean {
  // A lone bare number is only chrome when it sits by itself on a row; inside a
  // real row it is almost certainly an answer.
  if (/^\d+$/.test(text) && cellCount > 1) return false;
  return FURNITURE.some((re) => re.test(text));
}

/** Group a PDF's text items into left-to-right visual rows, top of page first. */
export async function readPdfRows(bytes: Uint8Array): Promise<FormRow[]> {
  const { getDocumentProxy } = await import("unpdf");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdf: any = await getDocumentProxy(bytes);
  const out: FormRow[] = [];

  for (let page = 1; page <= pdf.numPages; page += 1) {
    const content = await (await pdf.getPage(page)).getTextContent();
    const items = (content.items as Array<{ str?: string; transform?: number[]; height?: number }>)
      .map((item) => ({
        text: (item.str ?? "").trim(),
        x: Math.round(item.transform?.[4] ?? 0),
        y: Math.round(item.transform?.[5] ?? 0),
        // transform[0] is the horizontal scale, which is the rendered font size
        // for ordinary text; `height` is the fallback when it is zero.
        size: Math.round((item.transform?.[0] || item.height || 0) * 10) / 10
      }))
      .filter((item) => item.text.length > 0);

    const buckets: Array<{ y: number; cells: FormCell[] }> = [];
    for (const item of items) {
      const bucket = buckets.find((b) => Math.abs(b.y - item.y) <= ROW_TOLERANCE);
      if (bucket) bucket.cells.push({ text: item.text, x: item.x, size: item.size });
      else buckets.push({ y: item.y, cells: [{ text: item.text, x: item.x, size: item.size }] });
    }

    for (const bucket of buckets.sort((a, b) => b.y - a.y)) {
      const cells = bucket.cells
        .sort((a, b) => a.x - b.x)
        .filter((cell) => !isFurniture(cell.text, bucket.cells.length));
      if (cells.length > 0) out.push({ page, y: bucket.y, cells });
    }
  }
  return out;
}

/** The verbatim line a value was read from, for a human to audit against the PDF. */
export function rowText(row: FormRow): string {
  return row.cells.map((cell) => cell.text).join(" ");
}

// ---------------------------------------------------------------------------
// The name at the top of a resume
// ---------------------------------------------------------------------------

/**
 * Read the candidate's name off the top of a resume by TYPOGRAPHY rather than
 * by guessing at prose.
 *
 * The text-based readers in app/api/resume-intake could never do this reliably,
 * for a reason that is easy to miss: extractFileText collapses ALL whitespace to
 * single spaces, so `text.split("\n")` returns one line containing the entire
 * document. Every line-oriented rule was therefore running against a single
 * enormous string, which is how a name ends up fused to whatever follows it -
 * "TARA WARD VIP AVIATION", "Alexander Julian Warren 726 SOUTH 68TH STREET".
 *
 * A resume always puts the name at the top and always sets it larger than the
 * body. That is a far stronger signal than any wording heuristic, and it comes
 * free once the text items carry their position and size.
 */

/** Words that mean a big top-of-page line is a letterhead, not a person. */
const NOT_A_PERSON =
  /\b(resume|resum|curriculum|vitae|cv|profile|summary|objective|experience|education|employment|history|aviation|airlines?|airways|pilot|captain|first officer|flight|technician|mechanic|maintenance|engineer|manager|specialist|llc|inc|ltd|corp|company|university|college|address|phone|email|contact|information|skills|references?|licen[sc]es?|certificates?|ratings?|qualifications?|box|p\.?o\.?|street|avenue|road|drive|suite|apt|apartment|academy|military|institute|confidential|page)\b/i;

/** A plausible person: 2-4 capitalised words, no digits, no punctuation soup. */
function looksLikePersonName(value: string): boolean {
  const v = value.trim().replace(/\s+/g, " ");
  if (v.length < 4 || v.length > 60) return false;
  if (/\d/.test(v)) return false;
  if (/[@/\\|•·:;()]/.test(v)) return false;
  if (NOT_A_PERSON.test(v)) return false;
  const words = v.split(" ").filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;
  // A bare single letter means pdf.js split letter-spaced glyphs and the words
  // are not really words ("A Aron W Right" for Aaron Wright). A middle initial
  // is written "S." and keeps its period, so it survives this.
  if (words.some((w) => /^[A-Za-z]$/.test(w))) return false;
  // Every word starts with a capital (ALL CAPS headers are common and fine).
  return words.every((w) => /^[A-Z][A-Za-z'’.\-]*$/.test(w) || /^[A-Z'’.\-]+$/.test(w));
}

/** Title-case an ALL CAPS header so "TARA WARD" stores as "Tara Ward". */
function tidyName(value: string): string {
  const v = value.trim().replace(/\s+/g, " ");
  if (v !== v.toUpperCase()) return v;
  return v
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * The name from the top of page 1, or null when nothing is convincing.
 *
 * Only the top third of the page is considered, and only lines set at or near
 * the largest size found there — so body text can never win, however early it
 * appears. Candidates are tried largest-first, then highest-on-the-page.
 */
export async function readHeaderName(bytes: Uint8Array): Promise<string | null> {
  const rows = (await readPdfRows(bytes)).filter((row) => row.page === 1);
  if (rows.length === 0) return null;

  const ys = rows.map((row) => row.y);
  const top = Math.max(...ys);
  const bottom = Math.min(...ys);
  const cutoff = bottom + (top - bottom) * 0.66; // top third of the page

  const header = rows.filter((row) => row.y >= cutoff);
  if (header.length === 0) return null;

  const biggest = Math.max(...header.flatMap((row) => row.cells.map((cell) => cell.size)));
  if (biggest <= 0) return null;

  const candidates = header
    .map((row) => ({
      y: row.y,
      size: Math.max(...row.cells.map((cell) => cell.size)),
      // A name split across cells ("TARA" "WARD") rejoins here.
      text: row.cells.map((cell) => cell.text).join(" ")
    }))
    // Within 15% of the largest text on the page counts as "the big line".
    .filter((row) => row.size >= biggest * 0.85)
    .sort((a, b) => b.size - a.size || b.y - a.y);

  for (const candidate of candidates) {
    if (looksLikePersonName(candidate.text)) return tidyName(candidate.text);
    // "ALEXANDER WARREN Airline Transport Pilot" — keep the leading capitalised
    // run and drop the trailing title.
    const words = candidate.text.trim().split(/\s+/);
    for (let take = Math.min(4, words.length); take >= 2; take -= 1) {
      const head = words.slice(0, take).join(" ");
      if (looksLikePersonName(head)) return tidyName(head);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Field specs and templates
// ---------------------------------------------------------------------------

export type FieldKind = "hours" | "text";

export type FieldSpec = {
  /** CandidateMetric key this lands in (see lib/extraction/pilot-metrics.ts). */
  metricKey: string;
  label: RegExp;
  kind: FieldKind;
};

export type FormTemplate = {
  id: string;
  label: string;
  /** Cheap check against the whole document before trying to pair anything. */
  detect: (all: string) => boolean;
  fields: FieldSpec[];
};

/**
 * The signed Pilot Application (Adobe Sign, "PILOT APPLICATION | V4").
 *
 * Labels wrap across two lines — "TOTAL" sits above "FLIGHT TIME:" at the same
 * x — so pairing rejoins a cell with the one directly above it. TURIBINE is
 * their typo in the live form; matched both ways so a fix upstream will not
 * silently stop the field extracting.
 */
const PILOT_APPLICATION: FormTemplate = {
  id: "pilot-application-v4",
  label: "Pilot Application (signed)",
  // Detect on text that is CONTIGUOUS on one row. "TOTAL FLIGHT TIME" looks like
  // the obvious marker and is the wrong choice: the label wraps ("TOTAL" above
  // "FLIGHT TIME:"), so it only exists after the pairing step rejoins it, and
  // detection runs before that. Using it silently misdetected every Pilot
  // Application as a resume table.
  detect: (all) => /\bPILOT APPLICATION\b/i.test(all) && /(TUR[IB]+INE TIME|HRS IN AIRCRAFT)/i.test(all),
  fields: [
    { metricKey: "total_time", label: /^TOTAL FLIGHT TIME:$/i, kind: "hours" },
    { metricKey: "multi_engine", label: /^TOTAL MULTI ENGINE FLIGHT TIME:$/i, kind: "hours" },
    { metricKey: "pic", label: /^TOTAL PIC TIME:$/i, kind: "hours" },
    { metricKey: "sic", label: /^TOTAL SIC TIME:$/i, kind: "hours" },
    { metricKey: "single_pilot", label: /^TOTAL SINGLE PILOT TIME:$/i, kind: "hours" },
    { metricKey: "jet", label: /^TOTAL JET TIME:$/i, kind: "hours" },
    { metricKey: "turbine", label: /^TOTAL TUR[IB]+INE TIME:$/i, kind: "hours" },
    { metricKey: "instrument", label: /^TOTAL INSTRUMENT:$/i, kind: "hours" },
    { metricKey: "recency_12mo", label: /^HRS FLOWN LAST 12 MOS:$/i, kind: "hours" },
    { metricKey: "hours_in_type_applying", label: /^HRS IN AIRCRAFT APPLYING FOR:$/i, kind: "hours" },
    { metricKey: "medical_class", label: /^MEDICAL CLASS:$/i, kind: "text" }
  ]
};

/**
 * The Paycom application's "Job Level" question block.
 *
 * Two wordings are live at once — an older labelled style ("Total time 1566")
 * and a question style ("How many hours total time do you have? 4300") — so each
 * field matches either. Some rows carry a "Format: Total | Actual IMC |
 * Simulated" preamble before the answer, which the pairing step strips.
 */
const PAYCOM_APPLICATION: FormTemplate = {
  id: "paycom-application",
  label: "Paycom application",
  detect: (all) => /Job Level/i.test(all) && /Paycom|SKYSHARE/i.test(all),
  fields: [
    { metricKey: "total_time", label: /^(Total time|How many hours total time do you have\?)$/i, kind: "hours" },
    { metricKey: "pic", label: /^(PIC time|How many hours of PIC time do you have\?)$/i, kind: "hours" },
    {
      metricKey: "multi_engine",
      label: /^(Multi-engine time|How many hours of multi-?(engine )?time do you have\?)$/i,
      kind: "hours"
    },
    { metricKey: "jet", label: /^(Jet time|How many hours of jet time do you have\?)$/i, kind: "hours" },
    { metricKey: "turbine", label: /^(Fixed-wing turbine time|How many hours of turbine time do you have\?)$/i, kind: "hours" },
    {
      metricKey: "cross_country",
      label: /^(Cross-country time|How many hours of cross-?country time do you have\?)$/i,
      kind: "hours"
    },
    { metricKey: "instrument", label: /^(Instrument time|How many hours of instrument time do you have\?)/i, kind: "hours" },
    { metricKey: "night", label: /^(Night flying time|How many hours of night flying do you have\?)$/i, kind: "hours" },
    { metricKey: "recency_12mo", label: /^How many hours have you flown in the last 12 months\?$/i, kind: "hours" }
  ]
};

/**
 * A resume flight-time table. Deliberately conservative: resumes have no fixed
 * template, so this only claims a value when a known label sits immediately left
 * of a number on the same row. Multi-column tables fall out of that rule for
 * free ("Total Time 4300 Turbine Engine 2700 Cross Country 3150").
 *
 * Second in the precedence order the user set — Pilot Application, then resume,
 * then Paycom.
 */
const RESUME_TABLE: FormTemplate = {
  id: "resume-hours-table",
  label: "Resume flight-time table",
  detect: (all) => /total\s+(flight\s+)?time/i.test(all),
  fields: [
    { metricKey: "total_time", label: /^Total (Flight )?Time:?$/i, kind: "hours" },
    { metricKey: "pic", label: /^(Pilot[- ]in[- ]Command|PIC):?$/i, kind: "hours" },
    { metricKey: "sic", label: /^(Second[- ]in[- ]Command|SIC):?$/i, kind: "hours" },
    { metricKey: "multi_engine", label: /^Multi[- ]Engine:?$/i, kind: "hours" },
    { metricKey: "turbine", label: /^Turbine( Engine)?:?$/i, kind: "hours" },
    { metricKey: "jet", label: /^Jet( Time)?:?$/i, kind: "hours" },
    { metricKey: "cross_country", label: /^Cross[- ]Country:?$/i, kind: "hours" },
    { metricKey: "instrument", label: /^Instrument:?$/i, kind: "hours" },
    { metricKey: "night", label: /^Night:?$/i, kind: "hours" }
  ]
};

/**
 * DETECTION order — most specific first, resume table last as the fallback.
 *
 * This is NOT the trust order; that is SOURCE_PRECEDENCE further down. Having
 * one list do both jobs is what let the loose resume detector claim the Pilot
 * Application and the Paycom form before their own detectors were ever tried.
 * The resume table has no fixed template, so it can only ever be the last
 * thing tried.
 */
export const FORM_TEMPLATES: FormTemplate[] = [PILOT_APPLICATION, PAYCOM_APPLICATION, RESUME_TABLE];

export function detectTemplate(rows: FormRow[]): FormTemplate | null {
  const all = rows.map(rowText).join(" ");
  return FORM_TEMPLATES.find((template) => template.detect(all)) ?? null;
}

// ---------------------------------------------------------------------------
// Pairing
// ---------------------------------------------------------------------------

export type ExtractedField = {
  metricKey: string;
  /** Hours come back as a number; text fields (medical class) as a string. */
  value: number | string;
  /** The verbatim row it was read from — audit this instead of opening the PDF. */
  evidence: string;
  page: number;
};

/** Strip a "Format: Total | Actual IMC | Simulated" preamble sitting before the answer. */
function stripFormatHint(text: string): string {
  return text.replace(/^\s*Format:[^•]{0,140}•?\s*/i, "").trim();
}

function parseHours(raw: string): number | null {
  // Slash-separated answers ("340 / 237 / 103" = total / actual / simulated)
  // report the total, which is the first figure.
  const first = stripFormatHint(raw).split("/")[0] ?? "";
  const match = first.replace(/,/g, "").match(/^\+?(\d{1,6})\+?$/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value >= 0 && value <= 40000 ? value : null;
}

/**
 * Pair each of a template's labels with the value to its right.
 *
 * Two wrinkles the real documents forced:
 *  - Wrapped labels. The Pilot Application prints "TOTAL" on one row and
 *    "FLIGHT TIME:" on the next at the same x, so a cell is also tried joined
 *    to the cell directly above it.
 *  - Blank answers. A skipped field leaves no value, and without a stop the
 *    scan would walk on and take the NEXT field's number. So a candidate value
 *    is only accepted from the cell immediately to the right.
 */
export function extractFields(rows: FormRow[], template: FormTemplate): ExtractedField[] {
  const found = new Map<string, ExtractedField>();

  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    const above = rows[r - 1];

    for (let c = 0; c < row.cells.length; c += 1) {
      const cell = row.cells[c];
      const stacked = above?.cells.find((a) => Math.abs(a.x - cell.x) <= 6);
      const candidates = [cell.text, stacked ? `${stacked.text} ${cell.text}` : null].filter(
        (value): value is string => value !== null
      );

      for (const field of template.fields) {
        if (found.has(field.metricKey)) continue;
        if (!candidates.some((text) => field.label.test(text))) continue;

        const next = row.cells[c + 1];
        if (!next) continue;
        const raw = stripFormatHint(next.text);
        if (!raw) continue;

        if (field.kind === "hours") {
          const hours = parseHours(next.text);
          if (hours === null) continue;
          found.set(field.metricKey, { metricKey: field.metricKey, value: hours, evidence: rowText(row), page: row.page });
        } else {
          // Don't swallow a following label as if it were an answer.
          if (/[:?]$/.test(raw)) continue;
          found.set(field.metricKey, { metricKey: field.metricKey, value: raw.slice(0, 60), evidence: rowText(row), page: row.page });
        }
      }
    }
  }

  return [...found.values()];
}

export type ParsedForm = {
  template: FormTemplate | null;
  fields: ExtractedField[];
  pageCount: number;
};

/** Read one PDF end to end: detect the template, pair its fields. */
export async function parsePdfForm(bytes: Uint8Array): Promise<ParsedForm> {
  const rows = await readPdfRows(bytes);
  const template = detectTemplate(rows);
  return {
    template,
    fields: template ? extractFields(rows, template) : [],
    pageCount: rows.length > 0 ? Math.max(...rows.map((row) => row.page)) : 0
  };
}

// ---------------------------------------------------------------------------
// Which document wins
// ---------------------------------------------------------------------------

/**
 * Source precedence, set by the user on 2026-07-28.
 *
 * Every one of these numbers is SELF-REPORTED by the candidate, so none of them
 * is ground truth and they routinely disagree — one G200 applicant gives total
 * time as 4,200 / 4,300 / 4,300 and PIC as 2,675 / 1,250 / 2,700 across his own
 * three documents. The Pilot Application leads because it is signed and carries
 * the certification clause; the resume comes next because many candidates have
 * no Pilot Application on file and a resume is more trustworthy than the Paycom
 * form. A losing value is never discarded — it is recorded as a conflict for a
 * human to settle.
 */
export const SOURCE_PRECEDENCE: string[] = [
  "pilot-application-v4",
  "resume-hours-table",
  "paycom-application"
];

export type ConflictingValue = {
  templateId: string;
  value: number | string;
  evidence: string;
};

export type MergedMetric = {
  metricKey: string;
  value: number | string;
  /** Which template the winning value came from. */
  fromTemplateId: string;
  evidence: string;
  /** Same metric, different answer, from a lower-precedence document. */
  conflicts: ConflictingValue[];
};

export type ParsedDocument = {
  templateId: string;
  fields: ExtractedField[];
};

/** Apply the precedence, keeping every disagreement visible. */
export function mergeByPrecedence(documents: ParsedDocument[]): MergedMetric[] {
  const ranked = [...documents].sort(
    (a, b) =>
      (SOURCE_PRECEDENCE.indexOf(a.templateId) + 1 || 99) -
      (SOURCE_PRECEDENCE.indexOf(b.templateId) + 1 || 99)
  );

  const merged = new Map<string, MergedMetric>();
  for (const document of ranked) {
    for (const field of document.fields) {
      const existing = merged.get(field.metricKey);
      if (!existing) {
        merged.set(field.metricKey, {
          metricKey: field.metricKey,
          value: field.value,
          fromTemplateId: document.templateId,
          evidence: field.evidence,
          conflicts: []
        });
        continue;
      }
      // Only a DIFFERENT answer is a conflict; agreement needs no note.
      if (existing.value !== field.value) {
        existing.conflicts.push({
          templateId: document.templateId,
          value: field.value,
          evidence: field.evidence
        });
      }
    }
  }
  return [...merged.values()];
}
