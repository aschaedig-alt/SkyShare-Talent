/**
 * Reading a Paycom "Hiring Metrics" export.
 *
 * Shared by the two scripts that consume one:
 *   scripts/import-paycom-sheet10.ts     — creates people and applications
 *   scripts/reconcile-paycom-stages.ts   — proposes stage changes for people we hold
 *
 * It lives here rather than in either script because the DATE HANDLING below is
 * the kind of bug that comes back if it exists in two places. It already cost one
 * repair pass: the first import read the .csv with the xlsx library, which
 * type-guessed "April 7, 2025" into the Excel serial 45754, and every one of
 * 8,800 applications was written about 43,000 years into the future.
 */
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { toHouseWording, stageForWording } from "@/lib/candidates/disposition-vocabulary";

export type Row = Record<string, string>;

/**
 * Cells do not all arrive as strings. The sheet parser hands back a number for a
 * numeric-looking cell however it is configured, and one of those reached .trim()
 * and stopped a run — so every raw cell goes through here first.
 */
export function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

/**
 * Excel serial day number -> Date.
 *
 * Day 1 is 1900-01-01, and the numbering carries Excel's own 1900 leap-year bug,
 * which is why the epoch here is 1899-12-30 rather than 1899-12-31.
 */
export function fromExcelSerial(n: number): Date | null {
  // Above ~80000 is the year 2119 and beyond; anything up there is not a date
  // from a recruiting export, it is a number that got into a date column.
  if (!Number.isFinite(n) || n <= 0 || n > 80000) return null;
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
}

/**
 * A date cell -> Date, or null.
 *
 * A bare numeric STRING is treated as a serial too. The string coercion that
 * caused the original bug had been added to stop a crash — and that crash was
 * this same bug announcing itself. Worth remembering: a defensive String() around
 * a value you have not identified turns a loud failure into a quiet wrong answer.
 */
export function parseDate(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === "number") return fromExcelSerial(raw);
  const s = str(raw).trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return fromExcelSerial(Number(s));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** One CSV line -> fields, honouring quotes and doubled quotes inside them. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Read the export.
 *
 * A .csv IS READ AS TEXT, WITH NO SPREADSHEET LIBRARY, and that is the whole
 * point of this function — see the date note at the top of the file. The export
 * comes out of Google Sheets saved to whatever format is asked for, so a real
 * workbook is possible too and xlsx is right for that: a .xlsx holds genuine
 * serial numbers and needs a reader that understands them. The rule is about
 * matching the reader to the file, not about avoiding the library.
 *
 * cellDates asks xlsx for real Date objects rather than serials, so the workbook
 * path does not reintroduce the same conversion.
 */
export function loadRows(path: string): Row[] {
  if (/\.csv$/i.test(path)) {
    const lines = readFileSync(path, "utf8").split(/\r?\n/);
    const header = splitCsvLine(lines[0]).map((h) => h.trim());
    const rows: Row[] = [];
    for (let i = 1; i < lines.length; i += 1) {
      if (!lines[i].trim()) continue;
      const fields = splitCsvLine(lines[i]);
      const row: Row = {};
      header.forEach((h, j) => {
        row[h] = fields[j] ?? "";
      });
      rows.push(row);
    }
    return rows;
  }

  const wb = XLSX.read(readFileSync(path), { cellDates: true });
  return XLSX.utils.sheet_to_json<Row>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
}

/** Paycom's own Application ID for a row, or "" — the exact join key. */
export function applicationId(r: Row): string {
  return str(r["Application ID"]).trim();
}

/**
 * The column an email address might arrive in.
 *
 * CONFIRMED BY HIM 2026-09-11: this report cannot be customised to add one, so in
 * practice the list stays empty-handed and matching falls to the Application ID.
 * It is kept because a DIFFERENT Paycom report may carry an address, and because
 * a header spelling should never be the reason a working export is ignored.
 */
export const EMAIL_HEADERS = [
  "Email Address",
  "Email",
  "E-mail",
  "E-mail Address",
  "Personal Email",
  "Personal Email Address",
  "Applicant Email",
  "Candidate Email"
];

/** The email on a row, lowercased, or "" if the export does not carry one. */
export function emailFromRow(r: Row): string {
  for (const h of EMAIL_HEADERS) {
    const v = str(r[h]).trim().toLowerCase();
    if (v && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return v;
  }
  return "";
}

/**
 * Every export row for ONE person -> the stage those applications imply.
 *
 * Shared so the importer and the reconciliation cannot drift apart: a person
 * created by one and later updated by the other must be read the same way.
 *
 * Most advanced first — being hired for one job outranks being interviewed for
 * another, which outranks any closed application. Where nothing is live, the most
 * recently decided application speaks for them.
 *
 * NOTE FOR CALLERS: "In Hiring Process" derives to "Applied", which is the
 * WEAKEST live answer, not a decision. The reconciliation must not write it —
 * doing so would drag somebody at Interviewing back to Applied.
 */
export function stageForPerson(rows: Row[]): string | null {
  if (rows.some((r) => r["Application Status"] === "Hired")) return "Hired";
  if (rows.some((r) => r["Application Status"] === "Offered")) return "Offer";
  if (rows.some((r) => r["Application Status"] === "In Hiring Process")) return "Applied";
  const sorted = [...rows].sort((a, b) => {
    const da = parseDate(a["Disposition Date"])?.getTime() ?? 0;
    const db = parseDate(b["Disposition Date"])?.getTime() ?? 0;
    return db - da;
  });
  for (const r of sorted) {
    const stage = stageForWording(toHouseWording(r.Disposition) ?? r.Disposition);
    if (stage) return stage;
  }
  return null;
}
