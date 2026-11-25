// The party guest list - the client-safe half (types, labels, the column reader).
// Aimee's feedback cmwwjwama + cmwwk53m7 (Nov 25 2026): "we need to see a guest
// list for the party. we know all employees are invited and can bring a plus 1 ...
// give us a place to mark confirmed attending, not able to attend, no response. we
// need to be able to modify the answers if they later change their mind. then those
// who havent rsvp'd we can multi select and send a bcc email to them asking again
// ... we also want to account for their answer to other questions in the email
// morgan sent and if they will have a plus 1. i need to be able to upload the info
// we have at least via csv, xls and pdf" - and then: "id like my app to be able to
// scan the main RSVP tab of this live document and transfer the info over in real
// time". The server half is lib/events/guest-list.ts.

export type GuestStatus = "CONFIRMED" | "DECLINED" | "NO_RESPONSE";

export const GUEST_STATUS_LABEL: Record<GuestStatus, string> = {
  CONFIRMED: "Attending",
  DECLINED: "Not attending",
  NO_RESPONSE: "No response"
};

/** Where a guest's answer last came from. */
export type GuestSource = "sheet" | "upload" | "manual";

export type GuestAnswer = { q: string; a: string };

export type GuestRow = {
  newHireId: string;
  name: string;
  position: string | null;
  department: string | null;
  email: string | null;
  status: GuestStatus;
  plusOne: boolean | null;
  guestName: string | null;
  allergies: string | null;
  /** Every other question on the form, word for word. */
  answers: GuestAnswer[];
  /** When they answered (the form's timestamp), or when HR changed it. */
  respondedAt: string | null;
  source: GuestSource | null;
  changedBy: string | null;
};

/** A response that could not be matched to a current employee. */
export type UnmatchedResponse = {
  email: string | null;
  name: string | null;
  status: GuestStatus;
  plusOne: boolean | null;
  guestName: string | null;
  respondedAt: string | null;
  source: GuestSource;
};

export type GuestSheetLink = {
  spreadsheetId: string;
  tab: string;
  url: string;
  linkedAt: string;
  linkedBy: string | null;
  lastSyncAt: string | null;
  lastSyncNote: string | null;
};

export type GuestReminder = { at: string; by: string | null; count: number; subject: string; mode: string };

export type GuestListView = {
  eventId: string;
  rows: GuestRow[];
  unmatched: UnmatchedResponse[];
  sheet: GuestSheetLink | null;
  reminders: GuestReminder[];
  /** True when the server can read Google Sheets (the service account is set). */
  sheetsConfigured: boolean;
  /** True when an undo of the last sync or import is available. */
  canUndo: boolean;
  undoNote: string | null;
};

/** One response in a normalized shape, from the sheet, a CSV/XLS file or a PDF. */
export type ResponseRow = {
  email: string | null;
  name: string | null;
  status: GuestStatus;
  plusOne: boolean | null;
  guestName: string | null;
  allergies: string | null;
  answers: GuestAnswer[];
  respondedAt: string | null;
};

/** What applying a set of responses would do (a preview) or did. */
export type ApplySummary = {
  matched: number;
  changed: number;
  attending: number;
  notAttending: number;
  /** Kept because HR changed them by hand after this response was given. */
  keptManual: number;
  unmatched: number;
  /** "Name: was -> now" lines, at most 40, for the preview. */
  changes: string[];
};

// ---------------------------------------------------------------------------
// Reading a header row. The RSVP form's own questions (Nov 25 2026): Timestamp,
// Email Address, "Will you be joining us?", "How long have you been employed at
// SkyShare?", "SkyShare Department and Title", "Will you be bringing a plus one?",
// "Guests name and relation to you", "Food Allergies", a photos question, and three
// fun questions. A CSV or spreadsheet with its own wording is read the same way:
// the columns are found by what their heading says, never by position.

export type ColumnMap = {
  timestamp: number;
  email: number;
  name: number;
  attending: number;
  plusOne: number;
  guestName: number;
  allergies: number;
  /** Every other column with a heading: kept as an answer. */
  others: number[];
};

const find = (heads: string[], ...tests: RegExp[]) => heads.findIndex((h) => tests.some((t) => t.test(h)));

export function mapColumns(header: string[]): ColumnMap {
  const heads = header.map((h) => (h ?? "").toString().trim().toLowerCase());
  const timestamp = find(heads, /^timestamp$/, /submitted|responded|date/);
  const email = find(heads, /e-?mail/);
  const plusOne = find(heads, /plus.?one|\+1|bring(ing)? a guest/);
  const guestName = find(heads, /guest'?s? name|name of (your )?guest|relation/);
  const attending = find(heads, /joining|attend|rsvp|coming|will you be there|going/);
  const allergies = find(heads, /allerg|dietary/);
  const name = heads.findIndex((h, i) => i !== guestName && /^(full )?name$|^employee( name)?$|first.*last|your name/.test(h));
  const used = new Set([timestamp, email, name, attending, plusOne, guestName, allergies].filter((i) => i >= 0));
  const others = heads.map((h, i) => (h && !used.has(i) ? i : -1)).filter((i) => i >= 0);
  return { timestamp, email, name, attending, plusOne, guestName, allergies, others };
}

const cell = (row: unknown[], i: number) => (i >= 0 && row[i] !== undefined && row[i] !== null ? String(row[i]).trim() : "");

/** "Yes, I'll be there" -> CONFIRMED; "Sorry, can't make it" -> DECLINED; blank -> NO_RESPONSE. */
export function readAttending(v: string): GuestStatus {
  const s = v.trim().toLowerCase();
  if (!s) return "NO_RESPONSE";
  if (/can'?t|cannot|not (be )?(able|coming|attend)|^no\b|sorry|declin|unable|won'?t/.test(s)) return "DECLINED";
  if (/^y|yes|attend|i'?ll be there|coming|confirm|going/.test(s)) return "CONFIRMED";
  return "NO_RESPONSE";
}

export function readYesNo(v: string): boolean | null {
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if (/^(y|yes|true|1)\b/.test(s)) return true;
  if (/^(n|no|false|0)\b|n\/a|none/.test(s)) return false;
  return null;
}

/** A guest-name cell that only says there is no guest. */
export function blankish(v: string): boolean {
  return /^(n\/?a|none|no|-+|\.)$/i.test(v.trim());
}

/** Rows of cells (header first) into normalized responses. Rows with no email and no name are dropped. */
export function rowsToResponses(table: unknown[][]): ResponseRow[] {
  if (!table.length) return [];
  const header = table[0].map((h) => (h ?? "").toString());
  const m = mapColumns(header);
  const out: ResponseRow[] = [];
  for (const row of table.slice(1)) {
    const email = cell(row, m.email).toLowerCase() || null;
    const name = cell(row, m.name) || null;
    if (!email && !name) continue;
    const guest = cell(row, m.guestName);
    const allergies = cell(row, m.allergies);
    const status = m.attending >= 0 ? readAttending(cell(row, m.attending)) : "NO_RESPONSE";
    const plusOne = readYesNo(cell(row, m.plusOne));
    out.push({
      email,
      name,
      status,
      plusOne: plusOne ?? (guest && !blankish(guest) ? true : null),
      guestName: guest && !blankish(guest) ? guest : null,
      allergies: allergies && !blankish(allergies) ? allergies : null,
      answers: m.others.map((i) => ({ q: header[i].trim(), a: cell(row, i) })).filter((x) => x.a),
      respondedAt: readTimestamp(cell(row, m.timestamp))
    });
  }
  return out;
}

/** "10/30/2026 14:27:49" (Google Forms, Mountain time) or an ISO string, as ISO. Null when unreadable. */
export function readTimestamp(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    // Google Forms writes the sheet's own time zone (Mountain). -07:00 is MST; a
    // response stamped in daylight time reads an hour early, which only matters for
    // ordering two answers from one person within that hour.
    const [, mo, d, y, h = "0", mi = "0", se = "0"] = m;
    const iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T${h.padStart(2, "0")}:${mi}:${se.padStart(2, "0")}-07:00`;
    const t = new Date(iso);
    return Number.isNaN(t.getTime()) ? null : t.toISOString();
  }
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

/** The spreadsheet id from a Google Sheets link, or the id itself. */
export function sheetIdFrom(input: string): string | null {
  const s = input.trim();
  const m = s.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(s) ? s : null;
}
