export type CsvRow = Record<string, string>;

export type CsvParseResult = {
  rows: CsvRow[];
  delimiter: string;
  headerCount: number;
  errorCount: number;
};

function stripByteOrderMark(value: string) {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function detectDelimiter(text: string): string {
  const delimiters = [",", ";", "\t", "|"];
  const firstLine = text.split("\n")[0] || "";

  let bestDelimiter = ",";
  let bestScore = 0;

  for (const delimiter of delimiters) {
    const count = (firstLine.match(new RegExp(`\\${delimiter}`, "g")) || []).length;
    if (count > bestScore) {
      bestScore = count;
      bestDelimiter = delimiter;
    }
  }

  return bestScore > 0 ? bestDelimiter : ",";
}

function parseQuotedField(line: string, startIndex: number, delimiter: string): [string, number] {
  let current = "";
  let index = startIndex + 1;

  while (index < line.length) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 2;
      continue;
    }

    if (char === '"') {
      index += 1;
      while (index < line.length && line[index] !== delimiter && line[index] !== "\n" && line[index] !== "\r") {
        index += 1;
      }
      return [current, index];
    }

    current += char;
    index += 1;
  }

  return [current, index];
}

function parseLineWithDelimiter(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let index = 0;

  while (index < line.length) {
    const char = line[index];

    if (char === '"') {
      const [quoted, nextIndex] = parseQuotedField(line, index, delimiter);
      current += quoted;
      index = nextIndex;
      continue;
    }

    if (char === delimiter) {
      fields.push(current);
      current = "";
      index += 1;
      continue;
    }

    if (char === "\n" || char === "\r") {
      break;
    }

    current += char;
    index += 1;
  }

  fields.push(current);
  return fields;
}

export function parseCsv(text: string): CsvParseResult {
  const source = stripByteOrderMark(text);
  const delimiter = detectDelimiter(source);

  const lines = source.split(/\r?\n/);
  const rows: string[][] = [];
  let errorCount = 0;

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    try {
      const fields = parseLineWithDelimiter(line, delimiter);
      if (fields.some((cell) => cell.trim().length > 0)) {
        rows.push(fields);
      }
    } catch (error) {
      errorCount += 1;
    }
  }

  if (rows.length === 0) {
    return {
      rows: [],
      delimiter,
      headerCount: 0,
      errorCount
    };
  }

  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((header, index) => header.trim() || `Column ${index + 1}`);
  const headerCount = headers.length;

  const csvRows = dataRows.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, (cells[index] ?? "").trim()]))
  );

  return {
    rows: csvRows,
    delimiter,
    headerCount,
    errorCount
  };
}

function normalizeHeaderKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function getFirstValue(row: CsvRow, keys: string[]) {
  const normalizedEntries = Object.entries(row).map(([key, value]) => [normalizeHeaderKey(key), value] as const);
  for (const key of keys) {
    const normalizedKey = normalizeHeaderKey(key);
    const match = normalizedEntries.find(([entryKey]) => entryKey === normalizedKey);
    if (match && match[1].trim()) {
      return match[1].trim();
    }
  }

  return null;
}
