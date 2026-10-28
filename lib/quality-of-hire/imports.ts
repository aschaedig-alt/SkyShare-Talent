// Quality of Hire - the three files the app cannot work out for itself, uploaded on
// the Reports > Quality of Hire tab as they arrive. He, 2026-10-27: "build this stuff
// into my app please? i can provide updated info as i have it".
//
//   Paycom terminations   Paycom's Employee Turnover Report, "Terminated Employee
//                         Details" tab (.xlsx): EE Code, Name "LAST, FIRST", Term Date,
//                         Term Type ("V - Career Opportunity"), Term Reason, Hire Date.
//                         Term Type is filled from 2025 on; older rows carry only the
//                         retired Term Reason field (Performance, RIF, Other Job).
//   HR's term-type sheet  The fill-in sheet of older leavers HR types by hand (.csv):
//                         Name, Paycom EE Code, Hire date, Left, "Voluntary or
//                         Involuntary (V / I / unknown)", "Reason (pick from list below)".
//                         "unknown" is an accepted answer (his, 2026-10-27).
//   Calendar interviews   One row per interview found on Google Calendar (.csv):
//                         newHireId, person, startDate, date, kind, interviewers,
//                         calendar. The app cannot read anybody's calendar, so this is
//                         produced outside it and uploaded again whenever it is re-run.
//
// Every upload is previewed first and nothing is stored until Save. A saved file is
// one ImportBatch row (status APPLIED, rows in summaryJson) - no person's record is
// touched, and the report reads the newest APPLIED batch of each kind. Undo marks a
// batch UNDONE, which brings back the one before it.

import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { clean, matchPerson, type ExportRow } from "@/lib/paycom/employee-export";
import { parseCsv, type CsvRow } from "@/lib/imports/csv";
import { isTestTagged } from "@/lib/testdata/markers";

export const QOH_SOURCES = {
  terminations: "QOH_PAYCOM_TERMINATIONS",
  termTypes: "QOH_HR_TERM_TYPES",
  interviews: "QOH_CALENDAR_INTERVIEWS"
} as const;
export type QohSource = keyof typeof QOH_SOURCES;
export const isQohSource = (v: unknown): v is QohSource => typeof v === "string" && v in QOH_SOURCES;

export type Voluntary = "V" | "I";

/** One leaver from Paycom or from HR's sheet. Dates are YYYY-MM-DD. */
export type ExitRow = {
  label: string;
  newHireId: string | null;
  eeCode: string | null;
  hireDate: string | null;
  termDate: string | null;
  voluntary: Voluntary | null;
  reason: string | null;
  /** Where the V/I came from, said plainly on the report. */
  typedFrom: "Term Type" | "older Term Reason" | "HR sheet" | null;
};

export const INTERVIEW_KINDS = ["recruiter_screen", "manager_video", "in_person", "other"] as const;
export type InterviewKind = (typeof INTERVIEW_KINDS)[number];

/** One interview, or - kind "none", no date - a hire the search found nothing for, so a
    zero is told apart from a hire that was never searched. */
export type CalendarInterview = {
  newHireId: string;
  startDate: string;
  date: string | null;
  kind: InterviewKind | "none";
  interviewers: string[];
};

export type StoredBatch<T> = { file: string; savedAt: string; uploadedBy: string | null; rows: T[] };

export type QohPreview = {
  source: QohSource;
  file: string;
  rows: number;
  matched: number;
  /** Labels of rows no single person fits - left out of the report until fixed. */
  unmatched: string[];
  /** One line each: what the file says, in counts. */
  facts: string[];
};

// ---------------------------------------------------------------------------
// people

type Person = { id: string; name: string; legalName: string | null; startDate: Date | null; terminationDate: Date | null };

async function loadPeople(): Promise<Person[]> {
  const rows = await prisma.newHire.findMany({
    where: { canceled: false },
    select: { id: true, name: true, legalName: true, startDate: true, terminationDate: true, tags: true }
  });
  return rows.filter((r) => !isTestTagged(r.tags));
}

/** "LAST, FIRST" or "First Last" into the shape matchPerson reads. */
function asExportRow(label: string, hire: string | null, term: string | null): ExportRow {
  let first = "";
  let last = "";
  if (label.includes(",")) [last, first = ""] = label.split(",");
  else {
    const words = label.trim().split(/\s+/);
    last = words.pop() ?? "";
    first = words.join(" ");
  }
  return { label, first: clean(first).split(" ").filter(Boolean), last: clean(last), position: "", hire: hire ?? "", prevTerm: null, rehire: null, term, dol: null };
}

/** The app's own spelling first (HR's sheet was written from it), then Paycom's rules. */
function findPerson(label: string, hire: string | null, term: string | null, people: Person[]): Person | null {
  const want = clean(label);
  const exact = people.filter((p) => clean(p.name) === want || (p.legalName && clean(p.legalName) === want));
  if (exact.length === 1) return exact[0];
  if (!label.trim()) return null;
  const row = asExportRow(label, hire, term);
  const found = matchPerson(row, people);
  if (found || !term) return found;
  // A last name spelled two ways (Paycom's "Yousef", the app's "Youssef"): the same
  // first name and the very same last day is one person, if only one fits.
  const first = row.first[0] ?? "";
  const sameExit = people.filter(
    (p) => p.terminationDate?.toISOString().slice(0, 10) === term && [p.name, p.legalName].some((n) => n && clean(n).split(" ")[0] === first)
  );
  return sameExit.length === 1 ? sameExit[0] : null;
}

// ---------------------------------------------------------------------------
// dates and V/I

const MDY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** A date as Paycom or a spreadsheet wrote it, or null for blank and Paycom's 00/00/0000. */
function dateOf(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    if (v < 20000 || v > 80000) return null;
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (!s || s.startsWith("00/00") || s.startsWith("0000")) return null;
  if (YMD.test(s)) return s;
  const m = MDY.exec(s);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  throw new Error(`"${s}" is not a date this reader knows`);
}

/** Paycom's Term Type: "V - Career Opportunity" -> V + "Career Opportunity". */
function splitTermType(raw: string): { voluntary: Voluntary | null; reason: string | null } {
  const m = /^\s*([VI])\s*-\s*(.+)$/i.exec(raw);
  if (m) return { voluntary: m[1].toUpperCase() as Voluntary, reason: m[2].trim() };
  return { voluntary: null, reason: raw.trim() || null };
}

// The retired Term Reason values on pre-2025 rows, and only the ones whose meaning is
// not in doubt. Anything else stays untyped rather than guessed.
const OLDER_REASON: Record<string, { voluntary: Voluntary; reason: string }> = {
  performance: { voluntary: "I", reason: "Performance" },
  rif: { voluntary: "I", reason: "Position Elimination / Layoff" },
  "other job": { voluntary: "V", reason: "Career Opportunity" },
  resignation: { voluntary: "V", reason: "Resignation" }
};

function voluntaryOf(raw: string): Voluntary | null | "unknown" {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s === "v" || s.startsWith("vol")) return "V";
  if (s === "i" || s.startsWith("invol")) return "I";
  if (s.startsWith("unk") || s === "?" || s === "n/a") return "unknown";
  throw new Error(`"${raw}" is not V, I or unknown`);
}

// ---------------------------------------------------------------------------
// readers

export function readTerminations(bytes: Uint8Array): Array<Omit<ExitRow, "newHireId">> {
  const wb = XLSX.read(bytes, { type: "array" });
  const sheetName = wb.SheetNames.find((n) => {
    const head = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, range: 0 })[0] ?? [];
    return head.includes("EE Code") && head.includes("Term Date");
  });
  if (!sheetName) throw new Error('No sheet with "EE Code" and "Term Date" columns - this should be Paycom\'s Terminated Employee Details tab.');
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { raw: false, defval: "" });
  return rows
    .filter((x) => String(x["Name"] ?? "").trim())
    .map((x) => {
      const label = String(x["Name"]).trim();
      const typed = splitTermType(String(x["Term Type"] ?? ""));
      const older = OLDER_REASON[String(x["Term Reason"] ?? "").trim().toLowerCase()];
      const fromType = typed.voluntary !== null;
      return {
        label,
        eeCode: String(x["EE Code"] ?? "").trim() || null,
        hireDate: dateOf(x["Hire Date"]),
        termDate: dateOf(x["Term Date"]),
        voluntary: fromType ? typed.voluntary : older?.voluntary ?? null,
        reason: fromType ? typed.reason : older?.reason ?? (String(x["Term Reason"] ?? "").trim() || null),
        typedFrom: fromType ? "Term Type" : older ? "older Term Reason" : null
      };
    });
}

const col = (row: CsvRow, re: RegExp) => {
  const key = Object.keys(row).find((k) => re.test(k));
  return key ? row[key] : "";
};

export function readTermTypeSheet(text: string): Array<Omit<ExitRow, "newHireId">> {
  const rows = parseCsv(text);
  if (rows.length && !Object.keys(rows[0]).some((k) => /voluntary/i.test(k))) {
    throw new Error('No "Voluntary or Involuntary" column - this should be the term-type sheet HR filled in.');
  }
  // the sheet ends with Paycom's reason list under the table: rows with no Left date
  return rows
    .filter((r) => col(r, /^name$/i).trim() && col(r, /^left$/i).trim())
    .map((r) => {
      const label = col(r, /^name$/i).trim();
      const v = voluntaryOf(col(r, /voluntary/i));
      const picked = splitTermType(col(r, /^reason/i));
      return {
        label,
        eeCode: col(r, /ee code/i).trim() || null,
        hireDate: dateOf(col(r, /^hire date$/i)),
        termDate: dateOf(col(r, /^left$/i)),
        voluntary: v === "V" || v === "I" ? v : picked.voluntary,
        reason: picked.reason,
        typedFrom: v === "V" || v === "I" || picked.voluntary ? "HR sheet" : null
      };
    });
}

export function readCalendarInterviews(text: string): CalendarInterview[] {
  const rows = parseCsv(text);
  if (rows.length && !("newHireId" in rows[0] && "kind" in rows[0])) {
    throw new Error("No newHireId and kind columns - this should be the calendar interview file (one row per interview).");
  }
  return rows.map((r, i) => {
    const kind = r.kind as CalendarInterview["kind"];
    if (kind !== "none" && !INTERVIEW_KINDS.includes(kind)) throw new Error(`Row ${i + 2}: "${r.kind}" is not an interview kind`);
    const date = dateOf(r.date);
    const startDate = dateOf(r.startDate);
    if (!r.newHireId || !startDate || (kind !== "none" && !date)) throw new Error(`Row ${i + 2}: needs newHireId, startDate and date`);
    return { newHireId: r.newHireId, startDate, date, kind, interviewers: (r.interviewers ?? "").split(/\s+/).filter(Boolean) };
  });
}

// ---------------------------------------------------------------------------
// preview and save

export type Prepared =
  | { source: "terminations" | "termTypes"; rows: ExitRow[]; preview: QohPreview }
  | { source: "interviews"; rows: CalendarInterview[]; preview: QohPreview };

export async function prepareUpload(source: QohSource, file: string, bytes: Uint8Array): Promise<Prepared> {
  const people = await loadPeople();
  if (source === "interviews") {
    const rows = readCalendarInterviews(new TextDecoder().decode(bytes));
    const ids = new Set(people.map((p) => p.id));
    const hires = new Set(rows.map((r) => `${r.newHireId}|${r.startDate}`));
    const missing = [...new Set(rows.filter((r) => !ids.has(r.newHireId)).map((r) => r.newHireId))];
    const found = rows.filter((r) => r.kind !== "none");
    const kinds = INTERVIEW_KINDS.map((k) => `${rows.filter((r) => r.kind === k).length} ${k.replace("_", " ")}`).join(", ");
    return {
      source,
      rows: rows.filter((r) => ids.has(r.newHireId)),
      preview: {
        source, file, rows: rows.length, matched: rows.length - rows.filter((r) => !ids.has(r.newHireId)).length,
        unmatched: missing.map((id) => `person ${id} is not in Journey`),
        facts: [`${found.length} interviews across ${hires.size} hires searched (${rows.filter((r) => r.kind === "none").length} with none found)`, kinds]
      }
    };
  }

  // Exits. HR's sheet can name an EE Code that only Paycom's file ties to a person.
  const raw = source === "terminations" ? readTerminations(bytes) : readTermTypeSheet(new TextDecoder().decode(bytes));
  const paycom = source === "termTypes" ? await latestBatch<ExitRow>("terminations") : null;
  const byCode = new Map((paycom?.rows ?? []).filter((r) => r.eeCode && r.newHireId).map((r) => [r.eeCode as string, r.newHireId as string]));
  const rows: ExitRow[] = raw.map((r) => ({
    ...r,
    newHireId: findPerson(r.label, r.hireDate, r.termDate, people)?.id ?? (r.eeCode ? byCode.get(r.eeCode) ?? null : null)
  }));
  const typed = rows.filter((r) => r.voluntary);
  const years = [...new Set(rows.map((r) => r.termDate?.slice(0, 4)).filter(Boolean))].sort();
  return {
    source,
    rows,
    preview: {
      source, file, rows: rows.length, matched: rows.filter((r) => r.newHireId).length,
      unmatched: rows.filter((r) => !r.newHireId).map((r) => `${r.label} (left ${r.termDate ?? "?"})`),
      facts: [
        `${rows.length} leavers${years.length ? `, ${years[0]} to ${years[years.length - 1]}` : ""}`,
        `${typed.length} say voluntary or involuntary (${typed.filter((r) => r.voluntary === "V").length} V, ${typed.filter((r) => r.voluntary === "I").length} I)` +
          (rows.some((r) => r.typedFrom === "older Term Reason") ? `, ${rows.filter((r) => r.typedFrom === "older Term Reason").length} of them read from the older Term Reason field` : "")
      ]
    }
  };
}

export async function saveUpload(prepared: Prepared, uploadedBy: string | null): Promise<string> {
  const stored: StoredBatch<unknown> = { file: prepared.preview.file, savedAt: new Date().toISOString(), uploadedBy, rows: prepared.rows };
  const batch = await prisma.importBatch.create({
    data: {
      sourceType: QOH_SOURCES[prepared.source],
      sourceFilename: prepared.preview.file,
      status: "APPLIED",
      rowCount: prepared.preview.rows,
      importedCount: prepared.preview.matched,
      skippedCount: prepared.preview.unmatched.length,
      summaryJson: JSON.stringify(stored),
      completedAt: new Date()
    }
  });
  return batch.id;
}

/** Undo: the batch stays on file, marked UNDONE, and the one before it is current again. */
export async function undoUpload(batchId: string): Promise<boolean> {
  const res = await prisma.importBatch.updateMany({
    where: { id: batchId, status: "APPLIED", sourceType: { in: Object.values(QOH_SOURCES) } },
    data: { status: "UNDONE" }
  });
  return res.count === 1;
}

export async function latestBatch<T>(source: QohSource): Promise<(StoredBatch<T> & { id: string }) | null> {
  const b = await prisma.importBatch.findFirst({
    where: { sourceType: QOH_SOURCES[source], status: "APPLIED" },
    orderBy: { createdAt: "desc" },
    select: { id: true, summaryJson: true }
  });
  if (!b?.summaryJson) return null;
  return { id: b.id, ...(JSON.parse(b.summaryJson) as StoredBatch<T>) };
}
