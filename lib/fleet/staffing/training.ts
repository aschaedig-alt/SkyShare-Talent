// Crew training records — the data behind the Training tab and behind the
// "training is over, move them to the line?" prompt.
//
// ONE RECORD PER TRAINING EVENT, NOT PER PERSON. The first cut of this file
// kept one record per pilot, which the real source data immediately disproved:
// the Training Info sheet has Fabio Alves twice (CJ2 FO, then G200 SIC), Kylee
// Madsen twice (PC-12 Captain, then CJ2 Captain), and four more besides. A
// pilot goes to training again for a new seat, a new aircraft, or recurrent
// training, so a per-person record would overwrite their history every time.
//
// WHY IT LIVES HERE AND NOT ON A PERSON'S DB RECORD: there is ONE shared live
// Postgres and no test database, so adding tables to hold a training window is
// the single most expensive way to get this wrong. These records ride along in
// the SAME WorkspaceSetting blob as the roster and the candidate links (scope
// "fleet", key "crew-roster") — no migration, and a malformed blob degrades to
// "no training records" rather than breaking the page.
//
// PURE module (no Prisma / no server-only imports) — the client chart imports it.

import type { CrewGroup } from "./types";
import { normSeat } from "./compute";
import { CREW_TRAINING } from "./crew-data";

/** The sheet's own Training Status column. This is whether the BOOKING is
    firm — deliberately NOT the same axis as how far along the training is,
    which is derived from the dates (see trainingProgress). */
export type TrainingConfirmation = "Confirmed" | "Tentative" | "Canceled" | "Unknown";

/** Whether this training is for an outside hire or an existing employee moving
    seats. The sheet's second, unlabelled column. */
export type TrainingHireType = "External" | "Internal";

/** The sheet's third, unlabelled column: SS = SkyShare / fractional,
    M = Managed tail, PDP = Pilot Development Program. */
export type TrainingPool = "SS" | "M" | "PDP";

export interface TrainingRecord {
  /** Deterministic, derived from name + training start + position, so
      re-importing a corrected sheet UPDATES rows instead of duplicating them. */
  id: string;
  /** As written on the sheet. */
  name: string;
  hireType?: TrainingHireType;
  pool?: TrainingPool;
  /** The seat this training is for, e.g. "PC-12 Captain". */
  position?: string;
  /** Employment start date, yyyy-mm-dd. */
  startDate?: string;
  orientationDate?: string;
  /** Basic indoc, yyyy-mm-dd. */
  indocDate?: string;
  /** Training start, yyyy-mm-dd. */
  start?: string;
  /** Training end, yyyy-mm-dd. The one that matters: it drives the completion prompt. */
  end?: string;
  /** Training location — "CAE LAS", "FSI DFW", "LOFT CRQ", "In House". */
  vendor?: string;
  confirmation: TrainingConfirmation;
  /** Everything below the sheet's ARCHIVED divider. Kept in full, just not
      counted as live — the user's words were "we still want the info, just not
      active". */
  archived: boolean;
  /** The sheet's Open Training Dates column, plus anything we could not parse
      as a date, so nothing on the sheet is silently lost. */
  note?: string;
  /** yyyy-mm-dd, set when somebody accepts the "move them to the line" prompt.
      App-owned workflow state, kept apart from the sheet's own columns so a
      re-import cannot undo a decision somebody made here. */
  completedAt?: string;
}

/** How far along a training event is — DERIVED from the dates, never stored, so
    it cannot drift out of step with them. */
export type TrainingProgress = "canceled" | "complete" | "in-training" | "scheduled" | "undated";

export const PROGRESS_LABEL: Record<TrainingProgress, string> = {
  canceled: "Canceled",
  complete: "Complete",
  "in-training": "In training",
  scheduled: "Scheduled",
  undated: "No dates"
};

export function trainingProgress(rec: TrainingRecord, today: string | null): TrainingProgress {
  if (rec.confirmation === "Canceled") return "canceled";
  if (rec.completedAt) return "complete";
  if (!rec.start && !rec.end) return "undated";
  if (!today) return "scheduled"; // pre-hydration: never claim anything is finished
  if (rec.end && rec.end < today) return "complete";
  if (rec.start && rec.start <= today) return "in-training";
  return "scheduled";
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isoStr(value: unknown): string | undefined {
  const s = str(value);
  return s && ISO.test(s) ? s : undefined;
}

function confirmationOf(value: unknown): TrainingConfirmation {
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (s.startsWith("confirm")) return "Confirmed";
  if (s.startsWith("tentat")) return "Tentative";
  if (s.startsWith("cancel")) return "Canceled";
  return "Unknown";
}

function hireTypeOf(value: unknown): TrainingHireType | undefined {
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (s === "external") return "External";
  if (s === "internal") return "Internal";
  return undefined;
}

function poolOf(value: unknown): TrainingPool | undefined {
  const s = typeof value === "string" ? value.trim().toUpperCase() : "";
  return s === "SS" || s === "M" || s === "PDP" ? (s as TrainingPool) : undefined;
}

/** Lowercase slug for ids. */
function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * A record's stable id. Deterministic on purpose: pasting a corrected sheet
 * produces the same ids and updates in place, rather than doubling every row.
 *
 * The training START is part of the key because that is what distinguishes two
 * courses for the same person; two rows with the same person, seat AND start
 * date are the same event written twice.
 */
export function trainingRecordId(name: string, start?: string, position?: string): string {
  return [slug(name), start ?? "nodate", slug(position ?? "")].filter(Boolean).join("_");
}

/** Coerce a stored/posted blob into safe training records. Never throws. */
export function normalizeTraining(input: unknown): TrainingRecord[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: TrainingRecord[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const name = str(r.name);
    if (!name) continue;

    const start = isoStr(r.start);
    const position = str(r.position);
    // Back-compat: records written before ids existed get one derived now.
    const id = str(r.id) ?? trainingRecordId(name, start, position);
    if (seen.has(id)) continue;
    seen.add(id);

    const rec: TrainingRecord = {
      id,
      name,
      confirmation: confirmationOf(r.confirmation),
      archived: r.archived === true
    };
    const hireType = hireTypeOf(r.hireType);
    const pool = poolOf(r.pool);
    const startDate = isoStr(r.startDate);
    const orientationDate = isoStr(r.orientationDate);
    const indocDate = isoStr(r.indocDate);
    const end = isoStr(r.end);
    const vendor = str(r.vendor);
    const note = str(r.note);
    const completedAt = isoStr(r.completedAt);
    if (hireType) rec.hireType = hireType;
    if (pool) rec.pool = pool;
    if (position) rec.position = position;
    if (startDate) rec.startDate = startDate;
    if (orientationDate) rec.orientationDate = orientationDate;
    if (indocDate) rec.indocDate = indocDate;
    if (start) rec.start = start;
    if (end) rec.end = end;
    if (vendor) rec.vendor = vendor;
    if (note) rec.note = note;
    if (completedAt) rec.completedAt = completedAt;
    out.push(rec);
  }
  return out;
}

// --- matching a sheet name to a chart name ----------------------------------

/**
 * Names on the sheet and names on the chart are written by different people and
 * do not always agree: "Joshua (Brock) Tyler" is the chart's "Brock Tyler",
 * "Aleksandar (Alex) Kostic" is "Aleksandar Kostic", "Alvaro Martin (Was Nick
 * Smout)" is "Alvaro Martin". Strip the parentheticals and compare on first and
 * last word only.
 *
 * Deliberately conservative — it never guesses across different surnames. Two
 * genuinely different people are never merged; the cost is that some records
 * show as "not on the chart", which the Training tab says plainly so somebody
 * can fix the spelling.
 */
export function matchKey(name: string): string {
  const cleaned = name
    .replace(/\([^)]*\)/g, " ")
    .replace(/"[^"]*"/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length === 0) return cleaned;
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

/** Everyone the CHART says is in training right now, with where they sit. */
export function pilotsInTraining(groups: CrewGroup[]): { name: string; aircraft: string; seat: string; gIdx: number; seatKey: "pic" | "sic" | "cabin" }[] {
  const out: { name: string; aircraft: string; seat: string; gIdx: number; seatKey: "pic" | "sic" | "cabin" }[] = [];
  const SEAT_WORD = { pic: "Captain", sic: "First Officer", cabin: "Cabin" } as const;
  groups.forEach((g, gIdx) => {
    (["pic", "sic", "cabin"] as const).forEach((seatKey) => {
      normSeat(g[seatKey]).train.forEach((name) => {
        out.push({ name, aircraft: g.name, seat: SEAT_WORD[seatKey], gIdx, seatKey });
      });
    });
  });
  return out;
}

export type TrainingRow = TrainingRecord & { onChart: boolean; missing: boolean; progress: TrainingProgress };

/**
 * The Training tab's rows: every stored record, PLUS a placeholder for anyone
 * the chart shows in a training seat with no record at all.
 *
 * The placeholders are the point. Without them the tab can look complete while
 * the chart plainly shows somebody in training nobody has entered dates for.
 */
export function trainingRows(groups: CrewGroup[], records: TrainingRecord[], today: string | null): TrainingRow[] {
  const onChart = pilotsInTraining(groups);
  const chartKeys = new Set(onChart.map((p) => matchKey(p.name)));

  const rows: TrainingRow[] = records.map((r) => ({
    ...r,
    onChart: chartKeys.has(matchKey(r.name)),
    missing: false,
    progress: trainingProgress(r, today)
  }));

  // Only LIVE records count as covering somebody — an archived course from 2024
  // does not explain why they are in a training seat today.
  const covered = new Set(records.filter((r) => !r.archived).map((r) => matchKey(r.name)));
  for (const p of onChart) {
    const key = matchKey(p.name);
    if (covered.has(key)) continue;
    covered.add(key);
    rows.push({
      id: trainingRecordId(p.name, undefined, `${p.aircraft} ${p.seat}`),
      name: p.name,
      position: `${p.aircraft} ${p.seat}`,
      confirmation: "Unknown",
      archived: false,
      onChart: true,
      missing: true,
      progress: "undated"
    });
  }
  return rows;
}

/**
 * Who has finished: a live, non-cancelled training whose end date has passed,
 * for somebody the chart still shows in a training seat.
 *
 * All of those conditions are required. An end date alone would nag about
 * pilots moved across weeks ago; a training seat alone is just the chart; and
 * completedAt is what stops the same person being offered twice.
 */
export function completedTraining(
  groups: CrewGroup[],
  records: TrainingRecord[],
  today: string | null
): { name: string; end: string; recordId: string; aircraft: string; seat: string; gIdx: number; seatKey: "pic" | "sic" | "cabin" }[] {
  if (!today) return []; // pre-hydration: no date, no claims
  // end < today, not <=: a course finishing TODAY is not over yet, and nagging
  // on the last day is how the prompt earns a reputation for being wrong.
  // Matches trainingProgress, so the tab and the banner cannot disagree.
  const live = records.filter((r) => !r.archived && !r.completedAt && r.confirmation !== "Canceled" && r.end && r.end < today);
  const byKey = new Map<string, TrainingRecord>();
  for (const r of live) {
    // If somebody has two finished courses, offer the most recent one.
    const key = matchKey(r.name);
    const prev = byKey.get(key);
    if (!prev || (r.end ?? "") > (prev.end ?? "")) byKey.set(key, r);
  }

  const out: { name: string; end: string; recordId: string; aircraft: string; seat: string; gIdx: number; seatKey: "pic" | "sic" | "cabin" }[] = [];
  for (const p of pilotsInTraining(groups)) {
    const rec = byKey.get(matchKey(p.name));
    if (!rec?.end) continue;
    out.push({ ...p, end: rec.end, recordId: rec.id });
  }
  return out.sort((a, b) => a.end.localeCompare(b.end) || a.name.localeCompare(b.name));
}

// --- date parsing -----------------------------------------------------------

/** Text the sheet uses where a date should be. Recorded in the note, not dropped. */
const NON_DATE = /^(n\/?a|tbd|done|contract|in progress|pending|-|—)$/i;

/**
 * Parse a date the way the source sheets actually write them: 7/13/2026,
 * 07-13-26, 2026-07-13. Returns yyyy-mm-dd, or undefined when it cannot tell.
 *
 * An unparsed cell is DROPPED rather than guessed, because a wrong END DATE is
 * what fires "training complete" for the wrong person at the wrong time. Years
 * before 1990 are rejected outright — the sheet contains "5/26/0206", a typo
 * for 2026 that would otherwise import as the year 206 and sort to the top of
 * every list forever.
 */
export function parseSheetDate(value: string, todayYear: number): string | undefined {
  const s = value.trim();
  if (!s || NON_DATE.test(s)) return undefined;
  if (ISO.test(s)) return Number(s.slice(0, 4)) >= 1990 ? s : undefined;
  const m = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(s);
  if (!m) return undefined;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const rawYear = m[3] ? Number(m[3]) : todayYear;
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  if (year < 1990 || year > 2100) return undefined;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "11/17-11/21" in one cell — a range the sheet writes where a start date goes. */
function parseRange(value: string, year: number): { start?: string; end?: string } | null {
  const m = /^(\d{1,2}[/-]\d{1,2})\s*[–—-]\s*(\d{1,2}[/-]\d{1,2})$/.exec(value.trim());
  if (!m) return null;
  const start = parseSheetDate(m[1], year);
  const end = parseSheetDate(m[2], year);
  return start || end ? { start, end } : null;
}

// --- CSV / paste import -----------------------------------------------------

/** Split one CSV line, honouring quoted fields (the sheet has notes containing
    commas: "Indoc in OGD 07/06-07/08, travel to CAE on 07/09..."). */
export function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delim) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

type Field =
  | "name"
  | "hireType"
  | "pool"
  | "position"
  | "startDate"
  | "orientationDate"
  | "indocDate"
  | "start"
  | "end"
  | "vendor"
  | "confirmation"
  | "note";

/** Header spellings we accept, mapped to the field they fill. */
const HEADER_ALIASES: Record<string, Field> = {
  name: "name",
  pilot: "name",
  crewmember: "name",
  employee: "name",
  type: "hireType",
  hiretype: "hireType",
  internalexternal: "hireType",
  pool: "pool",
  program: "pool",
  position: "position",
  seat: "position",
  role: "position",
  aircraft: "position",
  startdate: "startDate",
  hiredate: "startDate",
  orientationdate: "orientationDate",
  orientation: "orientationDate",
  basicindocdate: "indocDate",
  indocdate: "indocDate",
  indoc: "indocDate",
  basicindoc: "indocDate",
  trainingstartdate: "start",
  trainingstart: "start",
  start: "start",
  begin: "start",
  trainingenddate: "end",
  trainingend: "end",
  end: "end",
  completion: "end",
  traininglocation: "vendor",
  location: "vendor",
  vendor: "vendor",
  school: "vendor",
  where: "vendor",
  trainingstatus: "confirmation",
  status: "confirmation",
  opentrainingdates: "note",
  note: "note",
  notes: "note",
  comment: "note",
  comments: "note"
};

const norm = (h: string) => h.toLowerCase().replace(/[^a-z]/g, "");

/**
 * Work out what an UNLABELLED column holds by looking at its values.
 *
 * The real sheet has two blank headers — one holding External/Internal and one
 * holding SS/M/PDP — and dropping them would lose whether a training is for a
 * new hire or an existing pilot moving seats, which is exactly the distinction
 * the user called out. Only fires when every non-empty value in the column
 * matches one vocabulary, so it cannot mis-claim a column of free text.
 */
function sniffColumn(values: string[]): Field | null {
  const vals = values.map((v) => v.trim()).filter(Boolean);
  if (vals.length === 0) return null;
  if (vals.every((v) => hireTypeOf(v) !== undefined)) return "hireType";
  if (vals.every((v) => poolOf(v) !== undefined || v === "-")) return "pool";
  return null;
}

export type ImportResult = {
  records: TrainingRecord[];
  /** Rows with no name (blank spacer rows, and the ARCHIVED divider itself). */
  skipped: number;
  archived: number;
  problems: string[];
};

/**
 * Turn a pasted Training Info sheet into records.
 *
 * Handles what the real sheet actually contains: quoted notes with commas, two
 * unlabelled columns, ~13 blank spacer rows, an "ARCHIVED" divider row after
 * which every row is historical, dates written six different ways, N/A and TBD
 * and "Contract" where a date should be, one date range in a single cell, and
 * a year typo'd as 0206.
 */
export function parseTrainingPaste(text: string, todayYear: number): ImportResult {
  const problems: string[] = [];
  const rawLines = text.split(/\r?\n/);
  const headerIdx = rawLines.findIndex((l) => l.trim().length > 0);
  if (headerIdx === -1 || rawLines.length - headerIdx < 2) {
    return { records: [], skipped: 0, archived: 0, problems: ["Paste the header row plus at least one pilot."] };
  }

  const delim = rawLines[headerIdx].includes("\t") ? "\t" : ",";
  const headerCells = splitCsvLine(rawLines[headerIdx], delim);
  const bodyLines = rawLines.slice(headerIdx + 1).filter((l) => l.trim().length > 0);
  const bodyCells = bodyLines.map((l) => splitCsvLine(l, delim));

  const fields: (Field | null)[] = headerCells.map((h, c) => {
    const mapped = HEADER_ALIASES[norm(h)];
    if (mapped) return mapped;
    return sniffColumn(bodyCells.map((cells) => cells[c] ?? ""));
  });

  if (!fields.includes("name")) {
    return { records: [], skipped: 0, archived: 0, problems: ["No NAME column found. The header row needs a column called Name (or Pilot)."] };
  }

  const records: TrainingRecord[] = [];
  const ids = new Set<string>();
  let skipped = 0;
  let archived = 0;
  let inArchive = false;

  for (const cells of bodyCells) {
    const row: Partial<Record<Field, string>> = {};
    fields.forEach((field, c) => {
      if (field) row[field] = (cells[c] ?? "").trim();
    });
    const name = row.name ?? "";

    // The divider row: every row after it is historical. It is not a person.
    if (/^archived$/i.test(name)) {
      inArchive = true;
      skipped++;
      continue;
    }
    if (!name) {
      skipped++;
      continue;
    }

    const noteParts: string[] = [];
    if (row.note) noteParts.push(row.note);

    // Dates. Anything unreadable is preserved in the note rather than dropped,
    // so a "TBD" training is visibly TBD instead of silently blank.
    const dateField = (key: "startDate" | "orientationDate" | "indocDate" | "start" | "end", label: string): string | undefined => {
      const raw = row[key];
      if (!raw) return undefined;
      const parsed = parseSheetDate(raw, todayYear);
      if (parsed) return parsed;
      if (NON_DATE.test(raw.trim())) {
        noteParts.push(`${label}: ${raw.trim()}`);
        return undefined;
      }
      problems.push(`${name}: could not read ${label} "${raw}" — kept as a note.`);
      noteParts.push(`${label}: ${raw.trim()}`);
      return undefined;
    };

    const startDate = dateField("startDate", "Start date");
    const orientationDate = dateField("orientationDate", "Orientation");
    const indocDate = dateField("indocDate", "Indoc");

    // Training start may be a RANGE in one cell ("11/17-11/21").
    let start: string | undefined;
    let end: string | undefined;
    const rangeYear = startDate ? Number(startDate.slice(0, 4)) : todayYear;
    const range = row.start ? parseRange(row.start, rangeYear) : null;
    if (range) {
      start = range.start;
      end = range.end;
    } else {
      start = dateField("start", "Training start");
    }
    if (!end) end = dateField("end", "Training end");

    const id = trainingRecordId(name, start, row.position);
    if (ids.has(id)) {
      problems.push(`${name}: a second row with the same seat and start date was ignored.`);
      continue;
    }
    ids.add(id);

    const rec: TrainingRecord = {
      id,
      name,
      confirmation: confirmationOf(row.confirmation),
      archived: inArchive
    };
    if (inArchive) archived++;
    const hireType = hireTypeOf(row.hireType);
    const pool = poolOf(row.pool);
    if (hireType) rec.hireType = hireType;
    if (pool) rec.pool = pool;
    if (row.position) rec.position = row.position;
    if (startDate) rec.startDate = startDate;
    if (orientationDate) rec.orientationDate = orientationDate;
    if (indocDate) rec.indocDate = indocDate;
    if (start) rec.start = start;
    if (end) rec.end = end;
    if (row.vendor && !NON_DATE.test(row.vendor)) rec.vendor = row.vendor;
    const note = noteParts.join(" · ").trim();
    if (note) rec.note = note;
    records.push(rec);
  }

  return { records: normalizeTraining(records), skipped, archived, problems };
}

// --- seed -------------------------------------------------------------------

/**
 * Seed records from the one piece of training data the app already had:
 * CREW_TRAINING in crew-data.ts, written as free text off the same Training
 * Info sheet ("in training 07/13-07/19 · CAE").
 *
 * Superseded the moment the real sheet is imported — these three exist so the
 * tab is not blank on a chart that plainly shows pilots in training. The dates
 * carry no year, so they resolve to the most recent occurrence that is not in
 * the future, and the original sentence is kept verbatim in the note.
 */
export function seedCrewTraining(now: Date = new Date()): TrainingRecord[] {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const year = now.getFullYear();
  const resolve = (md: string): string | undefined => {
    const d = parseSheetDate(md, year);
    if (!d) return undefined;
    return d <= today ? d : parseSheetDate(md, year - 1);
  };

  return Object.entries(CREW_TRAINING).map(([name, text]) => {
    let start: string | undefined;
    let end: string | undefined;
    const range = /(\d{1,2}\/\d{1,2})\s*[–—-]\s*(\d{1,2}\/\d{1,2})/.exec(text);
    if (range) {
      start = resolve(range[1]);
      end = resolve(range[2]);
    }
    const parts = text.split("·");
    const rec: TrainingRecord = {
      id: trainingRecordId(name, start),
      name,
      confirmation: "Unknown",
      archived: false,
      note: text
    };
    if (start) rec.start = start;
    if (end) rec.end = end;
    if (parts.length > 1) rec.vendor = parts[parts.length - 1].trim();
    return rec;
  });
}
