export type CsvRow = Record<string, string>;

function stripByteOrderMark(value: string) {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

export function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;
  const source = stripByteOrderMark(text);

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }

      row.push(current);
      current = "";
      if (row.some((cell) => cell.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    current += char;
  }

  row.push(current);
  if (row.some((cell) => cell.trim().length > 0)) {
    rows.push(row);
  }

  const [headerRow, ...dataRows] = rows;
  if (!headerRow) {
    return [];
  }

  const headers = headerRow.map((header, index) => header.trim() || `Column ${index + 1}`);

  return dataRows.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, (cells[index] ?? "").trim()]))
  );
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
