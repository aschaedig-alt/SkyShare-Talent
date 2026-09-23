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

import { formTicksEvidence } from "@/lib/candidates/certificates";
import { answersOnly, CELL_SEPARATOR } from "@/lib/files/pilot-application-labels";

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
  return (await readPdf(bytes)).rows;
}

/**
 * A PDF date ("D:20260120042203-08'00'") as a Date, or null. Only the year is
 * required by the format; the rest defaults, and no offset means UTC.
 */
export function parsePdfDate(raw: unknown): Date | null {
  const m = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:([Z+-])(\d{2})?'?(\d{2})?'?)?/.exec(String(raw ?? "").trim());
  if (!m) return null;
  const [, y, mo = "01", d = "01", h = "00", mi = "00", s = "00", sign, oh = "00", om = "00"] = m;
  const zone = !sign || sign === "Z" ? "Z" : `${sign}${oh}:${om}`;
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${zone}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The rows, plus the document's own ModDate — see ParsedForm.modifiedAt. */
async function readPdf(bytes: Uint8Array): Promise<{ rows: FormRow[]; modifiedAt: Date | null }> {
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
  const meta = await pdf.getMetadata().catch(() => null);
  return { rows: out, modifiedAt: parsePdfDate(meta?.info?.ModDate) };
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
  /** Anything that is not a label beside a value, read its own way — the Pilot Application's certificate boxes. */
  readExtra?: (rows: FormRow[]) => ExtractedField[];
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
  ],
  readExtra: (rows) => {
    const boxes = readCertificateBoxes(rows);
    if (!boxes) return [];
    return [
      {
        metricKey: "certificates",
        // The labels exactly as the form prints them, in form order.
        value: boxes.ticked.join(", "),
        evidence: formTicksEvidence(boxes.ticked),
        page: boxes.page
      }
    ];
  }
};

/**
 * The eleven boxes under "INDICATE ALL CERTIFICATES YOU CURRENTLY HOLD", as the
 * form prints them, in form order.
 */
export const PILOT_APPLICATION_BOXES = [
  "COMMERCIAL",
  "STUDENT",
  "PRIVATE",
  "CFI",
  "MEI",
  "INSTRUMENT RATING",
  "SINGLE ENGINE LAND",
  "MULTI ENGINE LAND",
  "ATP/CTP COMPLETED",
  "ATP",
  "ATP WRITTEN (IF NOT ATP)"
];

/** A ticked box. Adobe Sign draws the check as the ZapfDingbats glyph "4" (✔); an unticked box draws nothing at all. */
const TICK = /^(4|✓|✔)$/;

/**
 * Which certificate boxes are ticked on a signed Pilot Application.
 *
 * WHY BY POSITION. In the flattened text the eleven labels print as one run and
 * every tick on the page comes out later as a separate "4", with nothing tying a
 * tick to its box — so the model reading that text was guessing. Checked on
 * 2026-09-23 against the 249 applications behind the stored values: only 9 of
 * 216 people's stored certificates matched the boxes they actually ticked. By
 * position the pairing is exact, because the tick is drawn on the same line as
 * its label, just to its left (tick x≈75, label x≈95 on the V4 form).
 *
 * Returns null — "no answer", never "holds nothing" — when the block is missing
 * or only partly readable (fewer than 9 of the 11 labels found), or when no box
 * is ticked at all.
 */
export function readCertificateBoxes(rows: FormRow[]): { ticked: string[]; page: number } | null {
  const start = rows.findIndex((row) => row.cells.some((cell) => /INDICATE ALL CERTIFICATES/i.test(cell.text)));
  if (start < 0) return null;
  const page = rows[start].page;

  const ticked: string[] = [];
  let labels = 0;
  for (const row of rows.slice(start + 1, start + 20)) {
    if (row.page !== page) break;
    const label = row.cells.find((cell) => PILOT_APPLICATION_BOXES.includes(cell.text.trim().toUpperCase()));
    if (!label) continue;
    labels += 1;
    // Only a tick just left of the label counts. The aircraft-ratings answers
    // share these lines further right, and a "4" typed there is not a tick.
    const tick = row.cells.some((cell) => TICK.test(cell.text.trim()) && cell.x < label.x && label.x - cell.x <= 40);
    if (tick) ticked.push(label.text.trim().toUpperCase());
  }

  if (labels < 9 || ticked.length === 0) return null;
  return { ticked, page };
}

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
  /** Hours come back as a number; text fields (medical class, the ticked certificate boxes) as a string. */
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
  /**
   * The PDF's own ModDate. On a signed Pilot Application that is the moment
   * Adobe Sign completed it: on 2026-09-23 it matched the signature stamp and
   * the audit report on every file checked. Upload order is NOT signing order —
   * the Jul 27 backfill loaded a person's applications in no particular order.
   */
  modifiedAt: Date | null;
};

// ---------------------------------------------------------------------------
// What candidate search reads for a signed Pilot Application
// ---------------------------------------------------------------------------

/**
 * The "AIRCRAFT POSITION / APPLYING FOR:" answer, and the cells it sits in.
 * The label prints on two lines, the answer beside the second, and "WILLING TO /
 * RELOCATE:" shares the row further right - so the answer stops at the next
 * label.
 */
function readAppliedFor(rows: FormRow[]): { row: FormRow; cells: FormCell[]; value: string } | null {
  for (const row of rows) {
    const at = row.cells.findIndex((cell) => /^(AIRCRAFT\s+POSITION\s+)?APPLYING\s+FOR:?$/i.test(cell.text.trim()));
    if (at < 0) continue;
    const cells: FormCell[] = [];
    for (const cell of row.cells.slice(at + 1)) {
      const text = cell.text.trim();
      if (/[:?]$/.test(text) || /^(WILLING\s+TO|RELOCATE)\b/i.test(text)) break;
      cells.push(cell);
    }
    const value = cells.map((cell) => cell.text.trim()).join(" ").replace(/\s+/g, " ").trim();
    return value ? { row, cells, value: value.slice(0, 200) } : null;
  }
  return null;
}

/**
 * What candidate search reads for a signed Pilot Application (V3 or V4), or null
 * for any other document - search then reads its extractedText as before.
 *
 * WHY. The flattened text of a filled form runs its answers together: "Hunter
 * Shane Tueller2386 E Haven Lane3852297212Holladay41901141stChallenger 350 First
 * Officerhuntertueller11@gmail.com", and "PC-24" glued to its hours as
 * "PC-24393". No word or number can be found cleanly in that. Read by layout,
 * every answer is its own cell, so the text search reads is those rows with the
 * cells spaced apart.
 *
 * The one answer taken OUT is the position they applied for. It is what they
 * applied to, not what they have flown, and leaving it in meant a search that
 * skipped job titles still found every applicant through their own form. It is
 * returned separately so search can count it as a job applied to.
 */
export async function pilotApplicationSearchFields(
  bytes: Uint8Array
): Promise<{ searchText: string; appliedForText: string | null } | null> {
  const { rows } = await readPdf(bytes);
  // V4 is today's form. V3 is the JazzHR-era one ("PilotApplication • v3",
  // 801 files on 2026-09-23): a different layout with the same run-together
  // answers, and its position line reads "Aircraft Position Applying For:" inline.
  const v4 = detectTemplate(rows)?.id === "pilot-application-v4";
  const v3 = !v4 && rows.slice(0, 12).some((row) => /PilotApplication\s*\S?\s*v3\b|PILOT APPLICATION\s*\(COMPLETE ENTIRE FORM\)/i.test(rowText(row)));
  if (!v4 && !v3) return null;
  const appliedFor = readAppliedFor(rows);
  const lines: string[] = [];
  let page = rows[0]?.page ?? 1;
  for (const row of rows) {
    if (row.page !== page) {
      lines.push("");
      page = row.page;
    }
    const cells = appliedFor && row === appliedFor.row ? row.cells.filter((cell) => !appliedFor.cells.includes(cell)) : row.cells;
    const line = cells.map((cell) => cell.text.trim()).filter(Boolean).join(CELL_SEPARATOR);
    if (line) lines.push(line);
  }
  // Only the ANSWERS are searched: the form's printed labels are on every copy,
  // so leaving them in made "atp" or "pic" find everybody who ever filled it in.
  // See lib/files/pilot-application-labels.ts.
  return { searchText: answersOnly(lines.join("\n")), appliedForText: appliedFor?.value ?? null };
}

/**
 * The same, shaped for a file row being written: empty unless it is a PDF
 * Pilot Application. Never throws - an upload must not fail because this did.
 * Works on a COPY of the bytes, because the PDF reader detaches the buffer it is
 * given and the caller usually still needs them.
 */
export async function searchFieldsForFile(
  bytes: Uint8Array | Buffer,
  mimeType: string | null | undefined,
  filename: string | null | undefined
): Promise<{ searchText?: string; appliedForText?: string }> {
  const pdf = (mimeType ?? "").includes("pdf") || (filename ?? "").toLowerCase().endsWith(".pdf");
  if (!pdf) return {};
  try {
    const fields = await pilotApplicationSearchFields(new Uint8Array(bytes).slice());
    if (!fields) return {};
    return fields.appliedForText ? { searchText: fields.searchText, appliedForText: fields.appliedForText } : { searchText: fields.searchText };
  } catch {
    return {};
  }
}

/** Read one PDF end to end: detect the template, pair its fields, read anything else it defines. */
export async function parsePdfForm(bytes: Uint8Array): Promise<ParsedForm> {
  const { rows, modifiedAt } = await readPdf(bytes);
  const template = detectTemplate(rows);
  return {
    template,
    fields: template ? [...extractFields(rows, template), ...(template.readExtra?.(rows) ?? [])] : [],
    pageCount: rows.length > 0 ? Math.max(...rows.map((row) => row.page)) : 0,
    modifiedAt
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
