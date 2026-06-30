// Parse a pasted/uploaded new-hire roster into canonical hire rows. Pure +
// shared so the import modal and the API agree on the mapping. Nothing is
// created here.
//
// Handles BOTH layouts, auto-detected:
//  - Standard: field names across the top row, one person per row.
//  - Transposed: field names down the first column, one person per COLUMN
//    (the SkyShare "Pre-Onboarding Status" sheet). Blank/label columns with no
//    name (e.g. the Archived sheet's Role Tag / Owner columns) are skipped.

import { SHEET_LABEL_TO_KEY } from "@/lib/onboarding/tasks";

export type ImportTaskStatus = "DONE" | "TODO" | "NA";
export type ParsedHireTask = { key: string; status: ImportTaskStatus };

export type ParsedHireRow = {
  name: string;
  position: string | null;
  department: string | null;
  phone: string | null;
  ssEmail: string | null;
  personalEmail: string | null;
  offerSentDate: string | null;
  offerSignedDate: string | null;
  startDate: string | null;
  orientationDate: string | null;
  // Checklist statuses pulled from the sheet's task rows/columns (only cells with
  // a definite value; blanks are omitted so they never overwrite existing state).
  tasks: ParsedHireTask[];
};

export type HireParseResult = {
  rows: ParsedHireRow[];
  mapped: string[]; // original labels that matched a field
  unmapped: string[]; // original labels with no matching field
  skippedNoName: number; // people dropped because they had no name
  layout: "standard" | "transposed";
};

type FieldKey =
  | "name"
  | "position"
  | "department"
  | "phone"
  | "ssEmail"
  | "personalEmail"
  | "offerSentDate"
  | "offerSignedDate"
  | "startDate"
  | "orientationDate";

const DATE_FIELDS = new Set<FieldKey>(["offerSentDate", "offerSignedDate", "startDate", "orientationDate"]);

// Normalized label text -> canonical field key (synonyms included).
const HEADER_MAP: Record<string, FieldKey> = {
  name: "name",
  fullname: "name",
  position: "position",
  title: "position",
  role: "position",
  department: "department",
  dept: "department",
  phone: "phone",
  phonenumber: "phone",
  cell: "phone",
  mobile: "phone",
  email: "ssEmail",
  ssemail: "ssEmail",
  skyshareemail: "ssEmail",
  workemail: "ssEmail",
  companyemail: "ssEmail",
  personalemail: "personalEmail",
  personemail: "personalEmail",
  offersent: "offerSentDate",
  offersentdate: "offerSentDate",
  offersigned: "offerSignedDate",
  offersigneddate: "offerSignedDate",
  startdate: "startDate",
  start: "startDate",
  orientationdate: "orientationDate",
  orientation: "orientationDate"
};

const normalizeLabel = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");
const fieldOf = (label: string): FieldKey | null => HEADER_MAP[normalizeLabel(label ?? "")] ?? null;

// Task-label matching keeps words/commas/parens but strips quotes + collapses
// spaces, so the sheet's verbose checklist rows map to our task keys.
const normTaskLabel = (s: string) =>
  (s ?? "")
    .toLowerCase()
    .replace(/[‘’“”"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
const TASK_LOOKUP = new Map<string, string>(Object.entries(SHEET_LABEL_TO_KEY).map(([label, key]) => [normTaskLabel(label), key]));
const taskKeyOf = (label: string): string | null => TASK_LOOKUP.get(normTaskLabel(label)) ?? null;

// Interpret a checklist cell. Blank -> null (leave the task untouched).
function taskStatusOf(raw: string | undefined): ImportTaskStatus | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const low = v.toLowerCase();
  if (/^(true|yes|y|complete|completed|done|x|✓|✔)$/.test(low)) return "DONE";
  if (/^(false|no|n|todo|to do|incomplete|pending|not started)$/.test(low)) return "TODO";
  if (/^(n\/?a|na|not applicable)$/.test(low)) return "NA";
  // Any other non-empty content (a name, a group list, a note) means it happened.
  return "DONE";
}

// Treat placeholder values as empty (esp. for dates: "TBD", "N/A", "-", "n/a").
function cleanValue(field: FieldKey, raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (DATE_FIELDS.has(field) && /^(tbd|n\/?a|na|none|-|—)$/i.test(v)) return null;
  return v;
}

function emptyRow(): Record<FieldKey, string | null> {
  return {
    name: null,
    position: null,
    department: null,
    phone: null,
    ssEmail: null,
    personalEmail: null,
    offerSentDate: null,
    offerSignedDate: null,
    startDate: null,
    orientationDate: null
  };
}

// Split one delimited line, honoring double-quoted fields (which may contain the delimiter).
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function uniq(values: string[]): string[] {
  return [...new Set(values.filter((v) => v.trim()))];
}

export function parseHiresText(text: string): HireParseResult {
  const lines = (text ?? "").split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { rows: [], mapped: [], unmapped: [], skippedNoName: 0, layout: "standard" };
  }

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const grid = lines.map((l) => splitLine(l, delimiter));

  // Detect orientation: do the field labels run across the first row, or down
  // the first column? Whichever has more known-field matches wins.
  const firstRowMatches = (grid[0] ?? []).filter((c) => fieldOf(c)).length;
  const firstColMatches = grid.filter((r) => fieldOf(r[0] ?? "")).length;
  const transposed = firstColMatches > firstRowMatches;

  return transposed ? parseTransposed(grid) : parseStandard(grid);
}

function parseStandard(grid: string[][]): HireParseResult {
  const header = grid[0] ?? [];
  const mapped: string[] = [];
  const unmapped: string[] = [];
  const colToField: (FieldKey | null)[] = [];
  const colToTask: (string | null)[] = [];
  header.forEach((h) => {
    const field = fieldOf(h);
    const taskKey = field ? null : taskKeyOf(h);
    colToField.push(field);
    colToTask.push(taskKey);
    if (field || taskKey) mapped.push(h);
    else if (h.trim()) unmapped.push(h);
  });

  const rows: ParsedHireRow[] = [];
  let skippedNoName = 0;
  for (let i = 1; i < grid.length; i++) {
    const cells = grid[i];
    const row = emptyRow();
    colToField.forEach((field, idx) => {
      if (field) row[field] = cleanValue(field, cells[idx]);
    });
    if (!row.name) {
      skippedNoName++;
      continue;
    }
    const tasks: ParsedHireTask[] = [];
    colToTask.forEach((key, idx) => {
      if (!key) return;
      const status = taskStatusOf(cells[idx]);
      if (status) tasks.push({ key, status });
    });
    rows.push({ ...row, tasks } as ParsedHireRow);
  }
  return { rows, mapped: uniq(mapped), unmapped: uniq(unmapped), skippedNoName, layout: "standard" };
}

function parseTransposed(grid: string[][]): HireParseResult {
  const mapped: string[] = [];
  const unmapped: string[] = [];
  // label -> the row's cells excluding the leading label cell.
  const fieldRows = new Map<FieldKey, string[]>();
  const taskRows = new Map<string, string[]>();
  for (const r of grid) {
    const label = r[0] ?? "";
    const field = fieldOf(label);
    const taskKey = field ? null : taskKeyOf(label);
    if (field) {
      mapped.push(label);
      if (!fieldRows.has(field)) fieldRows.set(field, r.slice(1));
    } else if (taskKey) {
      mapped.push(label);
      if (!taskRows.has(taskKey)) taskRows.set(taskKey, r.slice(1));
    } else if (label.trim()) {
      unmapped.push(label);
    }
  }

  const nameRow = fieldRows.get("name");
  if (!nameRow) {
    return { rows: [], mapped: uniq(mapped), unmapped: uniq(unmapped), skippedNoName: 0, layout: "transposed" };
  }

  const colCount = Math.max(0, ...[...fieldRows.values()].map((a) => a.length), ...[...taskRows.values()].map((a) => a.length));
  const rows: ParsedHireRow[] = [];
  for (let c = 0; c < colCount; c++) {
    const name = (nameRow[c] ?? "").trim();
    if (!name) continue; // blank / label-only column — not a person
    const row = emptyRow();
    for (const [field, cells] of fieldRows) {
      row[field] = cleanValue(field, cells[c]);
    }
    const tasks: ParsedHireTask[] = [];
    for (const [key, cells] of taskRows) {
      const status = taskStatusOf(cells[c]);
      if (status) tasks.push({ key, status });
    }
    rows.push({ ...row, tasks } as ParsedHireRow);
  }
  // In transposed mode there is no "row missing a name" — empty columns are gaps.
  return { rows, mapped: uniq(mapped), unmapped: uniq(unmapped), skippedNoName: 0, layout: "transposed" };
}
