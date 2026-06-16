// Document type tags for candidate files. Used for the badge/dropdown on the Documents
// tab and to auto-tag files on upload. Pure (no server imports) — safe in client bundles.

export const DOCUMENT_TYPES = [
  "Resume",
  "Pilot Application",
  "Paycom Application",
  "Medical",
  "Passport",
  "FCC Radio Operator's License",
  "Driver's License",
  "Pilot's Certificate",
  "Insurance",
  "Other"
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === "string" && (DOCUMENT_TYPES as readonly string[]).includes(value);
}

// Best-guess a document type from a filename. Order matters — more specific first.
export function detectDocumentType(filename: string): DocumentType {
  const n = filename.toLowerCase();
  if (/paycom/.test(n)) return "Paycom Application";
  if (/passport/.test(n)) return "Passport";
  if (/\b(fcc|radio|operator)\b/.test(n)) return "FCC Radio Operator's License";
  if (/driver|driving|\bdl\b/.test(n)) return "Driver's License";
  if (/medical|first[\s-]?class|class[\s-]?(1|i)\b/.test(n)) return "Medical";
  if (/insurance/.test(n)) return "Insurance";
  if (/certificate|airman|\batp\b|\bcpl\b|\bcfi\b|rating/.test(n)) return "Pilot's Certificate";
  if (/resume|\bcv\b|curriculum/.test(n)) return "Resume";
  if (/pilot.*appl|appl|\bapp\b/.test(n)) return "Pilot Application";
  return "Other";
}
