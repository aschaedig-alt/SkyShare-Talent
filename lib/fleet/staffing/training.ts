// Crew training records — the data behind the Training tab and behind the
// "training is over, move them to the line?" prompt.
//
// WHY IT LIVES HERE AND NOT ON A PERSON'S DB RECORD: there is ONE shared live
// Postgres and no test database, so adding columns to Candidate/NewHire to hold
// a training window is the single most expensive way to get this wrong. These
// records ride along in the SAME WorkspaceSetting blob as the roster and the
// candidate links (scope "fleet", key "crew-roster"), exactly like they do —
// no migration, and a malformed blob degrades to "no training records" rather
// than breaking the page.
//
// The consequence to be honest about: a pilot's CANDIDATE PROFILE does not show
// these dates yet. The chart does, and the completion prompt uses them. Putting
// them on the profile is a separate decision about where training lives for
// everyone, not just for crew.
//
// PURE module (no Prisma / no server-only imports) — the client chart imports it.

import type { CrewGroup } from "./types";
import { normSeat } from "./compute";
import { CREW_TRAINING } from "./crew-data";

export type TrainingStatus = "scheduled" | "in-training" | "complete";

export interface TrainingRecord {
  /** Matches the name AS IT APPEARS ON THE CHART — the same key the candidate
      links use, for the same reason: chart names and profile names differ. */
  name: string;
  /** Aircraft this training is for, free text ("PC-12", "G450 / GV"). */
  aircraft?: string;
  /** Captain / First Officer / Cabin — free text, not an enum, because the
      source sheet writes it a dozen ways and losing a row to a strict parse is
      worse than storing what it said. */
  seat?: string;
  /** yyyy-mm-dd. */
  start?: string;
  /** yyyy-mm-dd. The one that matters: it drives the completion prompt. */
  end?: string;
  /** Where — "CAE", "FSI", "EFT LAS", a vendor and a location. */
  vendor?: string;
  status: TrainingStatus;
  note?: string;
}

export const TRAINING_STATUS_LABEL: Record<TrainingStatus, string> = {
  scheduled: "Scheduled",
  "in-training": "In training",
  complete: "Complete"
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isoStr(value: unknown): string | undefined {
  const s = str(value);
  return s && ISO.test(s) ? s : undefined;
}

function statusOf(value: unknown): TrainingStatus {
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (s === "complete" || s === "completed" || s === "done") return "complete";
  if (s === "scheduled" || s === "planned" || s === "upcoming") return "scheduled";
  return "in-training";
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
    // One live record per person. A second row for the same pilot is almost
    // always a re-paste of the same sheet, and two disagreeing end dates would
    // make the completion prompt fire twice for one person.
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const rec: TrainingRecord = { name, status: statusOf(r.status) };
    const aircraft = str(r.aircraft);
    const seat = str(r.seat);
    const start = isoStr(r.start);
    const end = isoStr(r.end);
    const vendor = str(r.vendor);
    const note = str(r.note);
    if (aircraft) rec.aircraft = aircraft;
    if (seat) rec.seat = seat;
    if (start) rec.start = start;
    if (end) rec.end = end;
    if (vendor) rec.vendor = vendor;
    if (note) rec.note = note;
    out.push(rec);
  }
  return out;
}

/**
 * Seed records from the one piece of training data the app already had:
 * CREW_TRAINING in crew-data.ts, written as free text off the Recruiting Status
 * Tracking "Training Info" tab ("in training 07/13-07/19 · CAE").
 *
 * The dates in that string carry NO YEAR, so they are resolved to the most
 * recent occurrence that is not in the future — the same rule as a departure
 * date. The original sentence is preserved verbatim in `note` so nothing is
 * lost to the parse, and every seeded row is editable in the Training tab.
 *
 * Server-side only in practice (it seeds the stored blob), so reading the clock
 * here is safe — the result reaches the client as plain strings.
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
    const rec: TrainingRecord = { name, status: "in-training", note: text };
    const range = /(\d{1,2}\/\d{1,2})\s*[–—-]\s*(\d{1,2}\/\d{1,2})/.exec(text);
    if (range) {
      const start = resolve(range[1]);
      const end = resolve(range[2]);
      if (start) rec.start = start;
      if (end) rec.end = end;
    }
    // Everything after the last "·" is where they are ("CAE", "CAE LAS").
    const parts = text.split("·");
    if (parts.length > 1) rec.vendor = parts[parts.length - 1].trim();
    return rec;
  });
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

/**
 * The Training tab's rows: every stored record, PLUS a placeholder row for
 * anyone the chart shows in training who has no record yet.
 *
 * The placeholders are the point. Without them the tab opens empty on a chart
 * that plainly has pilots in training, and the gap reads as "nothing to track"
 * rather than "nobody has entered these dates".
 */
export function trainingRows(groups: CrewGroup[], records: TrainingRecord[]): (TrainingRecord & { onChart: boolean; missing: boolean })[] {
  const byName = new Map(records.map((r) => [r.name.toLowerCase(), r]));
  const onChart = pilotsInTraining(groups);
  const chartNames = new Set(onChart.map((p) => p.name.toLowerCase()));

  const rows = records.map((r) => ({ ...r, onChart: chartNames.has(r.name.toLowerCase()), missing: false }));
  // One row per PERSON, not per seat: a dual-qualified pilot in training can sit
  // in two training seats, and two rows for one person would give them two end
  // dates to disagree about.
  const added = new Set<string>();
  for (const p of onChart) {
    const key = p.name.toLowerCase();
    if (byName.has(key) || added.has(key)) continue;
    added.add(key);
    rows.push({ name: p.name, aircraft: p.aircraft, seat: p.seat, status: "in-training", onChart: true, missing: true });
  }
  return rows;
}

/**
 * Who has finished: their training end date has passed, and the chart still has
 * them sitting in a training seat.
 *
 * Both halves are required. An end date alone would nag about pilots already
 * moved across weeks ago, and a training seat alone is just the chart.
 */
export function completedTraining(
  groups: CrewGroup[],
  records: TrainingRecord[],
  today: string | null
): { name: string; end: string; aircraft: string; seat: string; gIdx: number; seatKey: "pic" | "sic" | "cabin" }[] {
  if (!today) return []; // pre-hydration: no date, no claims
  const byName = new Map(records.map((r) => [r.name.toLowerCase(), r]));
  const out: { name: string; end: string; aircraft: string; seat: string; gIdx: number; seatKey: "pic" | "sic" | "cabin" }[] = [];
  for (const p of pilotsInTraining(groups)) {
    const rec = byName.get(p.name.toLowerCase());
    if (!rec?.end || rec.end > today) continue;
    out.push({ ...p, end: rec.end });
  }
  return out.sort((a, b) => a.end.localeCompare(b.end) || a.name.localeCompare(b.name));
}

// --- paste import -----------------------------------------------------------

/** Header spellings we accept, mapped to the field they fill. */
const HEADER_ALIASES: Record<string, keyof TrainingRecord> = {
  name: "name",
  pilot: "name",
  crewmember: "name",
  employee: "name",
  aircraft: "aircraft",
  type: "aircraft",
  fleet: "aircraft",
  seat: "seat",
  position: "seat",
  role: "seat",
  start: "start",
  startdate: "start",
  trainingstart: "start",
  begin: "start",
  end: "end",
  enddate: "end",
  trainingend: "end",
  complete: "end",
  completion: "end",
  vendor: "vendor",
  location: "vendor",
  school: "vendor",
  where: "vendor",
  status: "status",
  note: "note",
  notes: "note",
  comment: "note"
};

const norm = (h: string) => h.toLowerCase().replace(/[^a-z]/g, "");

/**
 * Parse a date the way the source sheets actually write them: 7/13/2026,
 * 07-13-26, 2026-07-13. Returns yyyy-mm-dd, or undefined when it cannot tell —
 * an unparsed cell is dropped rather than guessed, because a wrong END DATE is
 * what fires "training complete" at the wrong time.
 */
export function parseSheetDate(value: string, todayYear: number): string | undefined {
  const s = value.trim();
  if (!s) return undefined;
  if (ISO.test(s)) return s;
  const m = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(s);
  if (!m) return undefined;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const rawYear = m[3] ? Number(m[3]) : todayYear;
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export type ImportResult = { records: TrainingRecord[]; skipped: number; problems: string[] };

/**
 * Turn pasted spreadsheet rows into training records.
 *
 * Tab-separated (what a copy out of Excel/Sheets gives you) or comma-separated.
 * The first row must be headers; NAME is the only required column, since a row
 * with no person on it cannot be attached to anything.
 */
export function parseTrainingPaste(text: string, todayYear: number): ImportResult {
  const problems: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { records: [], skipped: 0, problems: ["Paste the header row plus at least one pilot."] };

  const delim = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(delim).map((h) => HEADER_ALIASES[norm(h)]);
  if (!headers.includes("name")) {
    return { records: [], skipped: 0, problems: ['No NAME column found. The header row needs a column called Name (or Pilot).'] };
  }

  const records: TrainingRecord[] = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(delim);
    const row: Record<string, string> = {};
    headers.forEach((field, c) => {
      if (field) row[field] = (cells[c] ?? "").trim();
    });
    if (!row.name) {
      skipped++;
      continue;
    }
    const rec: TrainingRecord = { name: row.name, status: statusOf(row.status) };
    if (row.aircraft) rec.aircraft = row.aircraft;
    if (row.seat) rec.seat = row.seat;
    if (row.vendor) rec.vendor = row.vendor;
    if (row.note) rec.note = row.note;
    if (row.start) {
      const d = parseSheetDate(row.start, todayYear);
      if (d) rec.start = d;
      else problems.push(`${row.name}: could not read the start date "${row.start}" — left blank.`);
    }
    if (row.end) {
      const d = parseSheetDate(row.end, todayYear);
      if (d) rec.end = d;
      else problems.push(`${row.name}: could not read the end date "${row.end}" — left blank.`);
    }
    records.push(rec);
  }
  // normalizeTraining keeps ONE row per person. Say so rather than letting a
  // second row for the same pilot disappear without a word — a re-pasted sheet
  // with two different end dates is exactly when you need to be told.
  const deduped = normalizeTraining(records);
  const dropped = records.length - deduped.length;
  if (dropped > 0) problems.push(`${dropped} duplicate row${dropped === 1 ? "" : "s"} ignored — one training record is kept per person (the first one).`);
  return { records: deduped, skipped, problems };
}
