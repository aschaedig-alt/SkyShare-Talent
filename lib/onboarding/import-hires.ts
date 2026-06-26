// Parse a pasted/uploaded new-hire roster (CSV or tab-separated copy from a
// spreadsheet) into canonical hire rows. Pure + shared so the import modal and
// the API agree on the column mapping. Nothing is created here.

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
};

export type HireParseResult = {
  rows: ParsedHireRow[];
  mapped: string[]; // original headers that matched a field
  unmapped: string[]; // original headers with no matching field
  skippedNoName: number; // data rows dropped because they had no name
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

// Normalized header text -> canonical field key (synonyms included).
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

const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

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

export function parseHiresText(text: string): HireParseResult {
  const lines = (text ?? "").split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { rows: [], mapped: [], unmapped: [], skippedNoName: 0 };
  }

  // Tab-separated if the header row has a tab (Excel/Sheets copy), else CSV.
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const headerCells = splitLine(lines[0], delimiter);

  const mapped: string[] = [];
  const unmapped: string[] = [];
  const colToField: (FieldKey | null)[] = headerCells.map((h) => {
    const field = HEADER_MAP[normalizeHeader(h)] ?? null;
    if (field) mapped.push(h);
    else if (h.trim()) unmapped.push(h);
    return field;
  });

  const rows: ParsedHireRow[] = [];
  let skippedNoName = 0;

  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i], delimiter);
    const row: Record<FieldKey, string | null> = {
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
    colToField.forEach((field, idx) => {
      if (!field) return;
      const value = (cells[idx] ?? "").trim();
      row[field] = value.length ? value : null;
    });
    if (!row.name) {
      skippedNoName++;
      continue;
    }
    rows.push(row as ParsedHireRow);
  }

  return { rows, mapped, unmapped, skippedNoName };
}
