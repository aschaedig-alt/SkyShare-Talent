import { google } from "googleapis";
import Anthropic from "@anthropic-ai/sdk";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { getEventRoster } from "@/lib/data/events";
import { CURRENT_EMPLOYEE_WHERE } from "@/lib/data/current-employee";
import { getOrientationChannelId, ORIENTATION_CHANNEL_ADDRESS } from "@/lib/front/config";
import { sendEmail } from "@/lib/front/messages";
import { guardDecision } from "@/lib/front/send-guard";
import { cleanEditedBody } from "@/lib/front/sanitize-body";
import {
  rowsToResponses,
  sheetIdFrom,
  type ApplySummary,
  type GuestAnswer,
  type GuestListView,
  type GuestReminder,
  type GuestRow,
  type GuestSheetLink,
  type GuestSource,
  type GuestStatus,
  type ResponseRow,
  type UnmatchedResponse
} from "@/lib/events/guest-list-shared";

// The party guest list - server half. Rules and her words: guest-list-shared.ts.
//
// EVERY CURRENT EMPLOYEE IS A GUEST. The list is the event roster (getEventRoster:
// current, not terminated, not cancelled) narrowed to CURRENT_EMPLOYEE_WHERE, so
// contractors are left out (his call, Nov 25 2026: employees only) - the same 179
// the party store credits. Nobody has to be "added". Whether they
// are coming lives where the rest of the app already reads it, EventAttendee.status
// (CONFIRMED / DECLINED; no row or PENDING = no response), so the event's
// "Going" count and Overview tile stay right without knowing about this file.
//
// EVERYTHING ELSE about their answer - plus one, guest's name, allergies, every
// other question on the form word for word, when and where it came from - is kept
// in one WorkspaceSetting per event (scope "events", key "guests:<eventId>"). No
// schema change against the shared live database: the trade every send record in
// lib/front makes.
//
// THE LIVE SHEET (her ask: "scan the main RSVP tab of this live document and
// transfer the info over in real time"). HR links the sheet once - after a preview
// of what it would change. From then on the Guests tab reads it every time it is
// opened (and on "Check the sheet now"), as the app's Google service account
// (the one lib/fleet/sheet-scan uses), read-only. Rows are matched by email - to a
// person's SkyShare or personal address, or to an address HR has matched by hand.
//
// HR'S CHANGES WIN UNTIL THE PERSON ANSWERS AGAIN. "We need to be able to modify the
// answers if they later change their mind": a status HR sets by hand is kept over
// any sheet row stamped BEFORE that change, and replaced by a row stamped after it
// (they filled the form in again). The same rule for a CSV, spreadsheet or PDF.
//
// UNDO: each sync or import that changes anything first saves what it is about to
// overwrite, and "Undo last update" puts it back.

const SCOPE = "events";
const keyFor = (eventId: string) => `guests:${eventId}`;
const DEFAULT_TAB = "RSVP";
/** How often opening the tab re-reads the sheet. */
const SYNC_EVERY_MS = 60_000;

type GuestInfo = {
  plusOne: boolean | null;
  guestName: string | null;
  allergies: string | null;
  answers: GuestAnswer[];
  respondedAt: string | null;
  source: GuestSource;
  /** When this entry last changed (for "HR's change wins until they answer again"). */
  changedAt: string;
  changedBy: string | null;
  /** The address the response came from. */
  email: string | null;
};

type UndoEntry = { newHireId: string; status: string | null; info: GuestInfo | null };

type Store = {
  sheet: GuestSheetLink | null;
  people: Record<string, GuestInfo>;
  /** Response address (lower case) -> newHireId, for addresses HR matched by hand. */
  aliases: Record<string, string>;
  unmatched: UnmatchedResponse[];
  reminders: GuestReminder[];
  undo: { note: string; at: string; entries: UndoEntry[] } | null;
};

const empty = (): Store => ({ sheet: null, people: {}, aliases: {}, unmatched: [], reminders: [], undo: null });

async function readStore(eventId: string): Promise<Store> {
  const row = await prisma.workspaceSetting.findUnique({ where: { scope_key: { scope: SCOPE, key: keyFor(eventId) } }, select: { valueJson: true } });
  if (!row?.valueJson) return empty();
  try {
    return { ...empty(), ...(JSON.parse(row.valueJson) as Partial<Store>) };
  } catch {
    return empty();
  }
}

async function writeStore(eventId: string, store: Store): Promise<void> {
  const valueJson = JSON.stringify(store);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: keyFor(eventId) } },
    create: { scope: SCOPE, key: keyFor(eventId), valueJson },
    update: { valueJson }
  });
}

export function isSheetsConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
}

async function assertInternalEvent(eventId: string): Promise<void> {
  const ev = await prisma.event.findUnique({ where: { id: eventId }, select: { audience: true } });
  if (!ev) throw new Error("Event not found.");
  if (ev.audience !== "INTERNAL") throw new Error("The guest list is for company events.");
}

// ---------------------------------------------------------------------------
// The people.

type Person = { id: string; name: string; position: string | null; department: string | null; emails: string[]; ssEmail: string | null };

async function people(): Promise<Person[]> {
  const all = await getEventRoster();
  // Employees only - his call, Nov 25 2026: contractors are not invited to the
  // party. getEventRoster also feeds the career-fair invite picker, which keeps
  // contractors, so the filter lives here rather than there.
  const emails = await prisma.newHire.findMany({ where: { id: { in: all.map((r) => r.id) }, ...CURRENT_EMPLOYEE_WHERE }, select: { id: true, ssEmail: true, personalEmail: true } });
  const byId = new Map(emails.map((e) => [e.id, e]));
  const roster = all.filter((r) => byId.has(r.id));
  return roster.map((r) => {
    const e = byId.get(r.id);
    const list = [e?.ssEmail, e?.personalEmail].map((x) => x?.trim().toLowerCase()).filter((x): x is string => Boolean(x));
    return { id: r.id, name: r.name, position: r.position, department: r.department, emails: list, ssEmail: e?.ssEmail?.trim() || null };
  });
}

const statusOf = (s: string | undefined | null): GuestStatus => (s === "CONFIRMED" ? "CONFIRMED" : s === "DECLINED" ? "DECLINED" : "NO_RESPONSE");

export async function getGuestList(eventId: string): Promise<GuestListView> {
  await assertInternalEvent(eventId);
  const [ppl, attendees, store] = await Promise.all([
    people(),
    prisma.eventAttendee.findMany({ where: { eventId }, select: { newHireId: true, status: true } }),
    readStore(eventId)
  ]);
  const statusBy = new Map(attendees.map((a) => [a.newHireId, a.status]));
  const rows: GuestRow[] = ppl.map((p) => {
    const info = store.people[p.id];
    return {
      newHireId: p.id,
      name: p.name,
      position: p.position,
      department: p.department,
      email: p.ssEmail ?? p.emails[0] ?? null,
      status: statusOf(statusBy.get(p.id)),
      plusOne: info?.plusOne ?? null,
      guestName: info?.guestName ?? null,
      allergies: info?.allergies ?? null,
      answers: info?.answers ?? [],
      respondedAt: info?.respondedAt ?? null,
      source: info?.source ?? null,
      changedBy: info?.changedBy ?? null
    };
  });
  return {
    eventId,
    rows,
    unmatched: store.unmatched,
    sheet: store.sheet,
    reminders: store.reminders,
    sheetsConfigured: isSheetsConfigured(),
    canUndo: Boolean(store.undo?.entries.length),
    undoNote: store.undo?.note ?? null
  };
}

// ---------------------------------------------------------------------------
// One guest, by hand.

export async function setGuest(
  eventId: string,
  newHireId: string,
  patch: { status?: GuestStatus; plusOne?: boolean | null; guestName?: string | null; allergies?: string | null },
  actor: string | null
): Promise<void> {
  await assertInternalEvent(eventId);
  const store = await readStore(eventId);
  const now = new Date().toISOString();
  if (patch.status) await writeStatus(eventId, newHireId, patch.status);
  const cur = store.people[newHireId];
  const tidy = (v: string | null | undefined, max: number) => (v === undefined ? undefined : v?.replace(/\s+/g, " ").trim().slice(0, max) || null);
  store.people[newHireId] = {
    plusOne: patch.plusOne !== undefined ? patch.plusOne : cur?.plusOne ?? null,
    guestName: tidy(patch.guestName, 120) !== undefined ? (tidy(patch.guestName, 120) as string | null) : cur?.guestName ?? null,
    allergies: tidy(patch.allergies, 300) !== undefined ? (tidy(patch.allergies, 300) as string | null) : cur?.allergies ?? null,
    answers: cur?.answers ?? [],
    respondedAt: cur?.respondedAt ?? null,
    email: cur?.email ?? null,
    source: "manual",
    changedAt: now,
    changedBy: actor
  };
  await writeStore(eventId, store);
}

async function writeStatus(eventId: string, newHireId: string, status: GuestStatus): Promise<void> {
  const value = status === "NO_RESPONSE" ? "PENDING" : status;
  await prisma.eventAttendee.upsert({
    where: { eventId_newHireId: { eventId, newHireId } },
    create: { eventId, newHireId, status: value },
    update: { status: value }
  });
}

// ---------------------------------------------------------------------------
// Applying responses - from the sheet, a file, or a PDF.

/**
 * Match responses to people and work out what changes. NEVER WRITES; applyResponses
 * does, from this plan. Later rows for the same person win (the form appends a new
 * row when someone answers again).
 */
async function plan(eventId: string, responses: ResponseRow[], source: GuestSource) {
  const [ppl, attendees, store] = await Promise.all([
    people(),
    prisma.eventAttendee.findMany({ where: { eventId }, select: { newHireId: true, status: true } }),
    readStore(eventId)
  ]);
  const byEmail = new Map<string, Person>();
  for (const p of ppl) for (const e of p.emails) byEmail.set(e, p);
  for (const [addr, id] of Object.entries(store.aliases)) {
    const p = ppl.find((x) => x.id === id);
    if (p) byEmail.set(addr, p);
  }
  const byName = new Map<string, Person>();
  const nameKey = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  for (const p of ppl) byName.set(nameKey(p.name), p);
  const statusBy = new Map(attendees.map((a) => [a.newHireId, statusOf(a.status)]));

  // Latest response per person / per unmatched address.
  const sorted = [...responses].sort((a, b) => (a.respondedAt ?? "").localeCompare(b.respondedAt ?? ""));
  const latest = new Map<string, { person: Person; r: ResponseRow }>();
  const unmatched = new Map<string, UnmatchedResponse>();
  for (const r of sorted) {
    const p = (r.email ? byEmail.get(r.email) : undefined) ?? (r.name ? byName.get(nameKey(r.name)) : undefined);
    if (p) latest.set(p.id, { person: p, r });
    else
      unmatched.set((r.email ?? r.name ?? "").toLowerCase(), {
        email: r.email,
        name: r.name,
        status: r.status,
        plusOne: r.plusOne,
        guestName: r.guestName,
        respondedAt: r.respondedAt,
        source
      });
  }

  const summary: ApplySummary = { matched: latest.size, changed: 0, attending: 0, notAttending: 0, keptManual: 0, unmatched: unmatched.size, changes: [] };
  const writes: Array<{ id: string; status: GuestStatus; info: GuestInfo; statusChanged: boolean }> = [];
  const now = new Date().toISOString();
  for (const { person, r } of latest.values()) {
    const cur = store.people[person.id];
    // HR changed it by hand after this response: keep HR's.
    if (cur?.source === "manual" && (!r.respondedAt || r.respondedAt <= cur.changedAt)) {
      summary.keptManual++;
      continue;
    }
    const was = statusBy.get(person.id) ?? "NO_RESPONSE";
    const status = r.status === "NO_RESPONSE" ? was : r.status;
    const info: GuestInfo = {
      plusOne: r.plusOne,
      guestName: r.guestName,
      allergies: r.allergies,
      answers: r.answers,
      respondedAt: r.respondedAt,
      email: r.email,
      source,
      changedAt: cur?.changedAt && cur.respondedAt === r.respondedAt && cur.source === source ? cur.changedAt : now,
      changedBy: null
    };
    const same =
      cur &&
      was === status &&
      cur.plusOne === info.plusOne &&
      cur.guestName === info.guestName &&
      cur.allergies === info.allergies &&
      cur.respondedAt === info.respondedAt &&
      JSON.stringify(cur.answers) === JSON.stringify(info.answers);
    if (status === "CONFIRMED") summary.attending++;
    if (status === "DECLINED") summary.notAttending++;
    if (same) continue;
    summary.changed++;
    if (summary.changes.length < 40) {
      const label = { CONFIRMED: "attending", DECLINED: "not attending", NO_RESPONSE: "no response" };
      summary.changes.push(was === status ? `${person.name}: answers updated` : `${person.name}: ${label[was]} -> ${label[status]}${info.plusOne ? " (+1)" : ""}`);
    }
    writes.push({ id: person.id, status, info, statusChanged: was !== status });
  }
  return { store, writes, unmatched: [...unmatched.values()], summary, statusBy };
}

/** Preview: what these responses would change. Writes nothing. */
export async function previewResponses(eventId: string, responses: ResponseRow[], source: GuestSource): Promise<ApplySummary> {
  await assertInternalEvent(eventId);
  return (await plan(eventId, responses, source)).summary;
}

/** Apply responses: statuses to EventAttendee, everything else to the store, with an undo of what it overwrote. */
export async function applyResponses(eventId: string, responses: ResponseRow[], source: GuestSource, note: string): Promise<ApplySummary> {
  await assertInternalEvent(eventId);
  const { store, writes, unmatched, summary, statusBy } = await plan(eventId, responses, source);
  if (writes.length) {
    store.undo = {
      note,
      at: new Date().toISOString(),
      entries: writes.map((w) => ({ newHireId: w.id, status: statusBy.has(w.id) ? (statusBy.get(w.id) as string) : null, info: store.people[w.id] ?? null }))
    };
    for (const w of writes) {
      if (w.statusChanged) await writeStatus(eventId, w.id, w.status);
      store.people[w.id] = w.info;
    }
  }
  // From the live sheet the unmatched list is replaced each time; an upload adds to it.
  store.unmatched =
    source === "sheet" ? [...store.unmatched.filter((u) => u.source !== "sheet"), ...unmatched] : [...store.unmatched.filter((u) => u.source === "sheet"), ...unmatched];
  await writeStore(eventId, store);
  return summary;
}

/** Put back what the last sync or import overwrote. */
export async function undoLast(eventId: string): Promise<number> {
  await assertInternalEvent(eventId);
  const store = await readStore(eventId);
  const undo = store.undo;
  if (!undo?.entries.length) return 0;
  for (const e of undo.entries) {
    if (e.status === null) await prisma.eventAttendee.deleteMany({ where: { eventId, newHireId: e.newHireId } });
    else await writeStatus(eventId, e.newHireId, statusOf(e.status));
    if (e.info) store.people[e.newHireId] = e.info;
    else delete store.people[e.newHireId];
  }
  store.undo = null;
  await writeStore(eventId, store);
  return undo.entries.length;
}

/** Match a response address HR recognises to a person; the next sync uses it. */
export async function matchAddress(eventId: string, email: string, newHireId: string): Promise<void> {
  await assertInternalEvent(eventId);
  const store = await readStore(eventId);
  store.aliases[email.trim().toLowerCase()] = newHireId;
  store.unmatched = store.unmatched.filter((u) => (u.email ?? "").toLowerCase() !== email.trim().toLowerCase());
  await writeStore(eventId, store);
}

// ---------------------------------------------------------------------------
// The live Google Sheet.

async function readSheetTable(spreadsheetId: string, tab: string): Promise<unknown[][]> {
  if (!isSheetsConfigured()) throw new Error("This server has no Google service account, so it cannot read sheets.");
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });
  const sheets = google.sheets({ version: "v4", auth });
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${tab.replace(/'/g, "''")}'!A1:Z2000` });
    return (res.data.values ?? []) as unknown[][];
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code === 403)
      throw new Error(`The app cannot open that sheet. Share it as Viewer with ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL} and try again.`);
    if (code === 404) throw new Error("That sheet was not found. Check the link.");
    if (code === 400) throw new Error(`The sheet has no tab called "${tab}".`);
    throw new Error("Could not read the sheet just now. Try again in a minute.");
  }
}

/** Preview linking a sheet: reads it and says what it would change. Writes nothing. */
export async function previewSheet(eventId: string, url: string, tab = DEFAULT_TAB): Promise<ApplySummary & { rows: number }> {
  await assertInternalEvent(eventId);
  const id = sheetIdFrom(url);
  if (!id) throw new Error("That does not look like a Google Sheets link.");
  const table = await readSheetTable(id, tab);
  const responses = rowsToResponses(table);
  return { ...(await previewResponses(eventId, responses, "sheet")), rows: responses.length };
}

/** Link the sheet (after the preview) and apply it. */
export async function linkSheet(eventId: string, url: string, tab: string, actor: string | null): Promise<ApplySummary> {
  await assertInternalEvent(eventId);
  const id = sheetIdFrom(url);
  if (!id) throw new Error("That does not look like a Google Sheets link.");
  const table = await readSheetTable(id, tab);
  const store = await readStore(eventId);
  store.sheet = { spreadsheetId: id, tab, url: url.trim(), linkedAt: new Date().toISOString(), linkedBy: actor, lastSyncAt: null, lastSyncNote: null };
  await writeStore(eventId, store);
  return syncFromTable(eventId, table, "Linked the RSVP sheet");
}

export async function unlinkSheet(eventId: string): Promise<void> {
  await assertInternalEvent(eventId);
  const store = await readStore(eventId);
  store.sheet = null;
  store.unmatched = store.unmatched.filter((u) => u.source !== "sheet");
  await writeStore(eventId, store);
}

async function syncFromTable(eventId: string, table: unknown[][], note: string): Promise<ApplySummary> {
  const summary = await applyResponses(eventId, rowsToResponses(table), "sheet", note);
  const store = await readStore(eventId);
  if (store.sheet) {
    store.sheet.lastSyncAt = new Date().toISOString();
    store.sheet.lastSyncNote = `${summary.matched} matched, ${summary.changed} changed${summary.unmatched ? `, ${summary.unmatched} not matched` : ""}${summary.keptManual ? `, ${summary.keptManual} kept as changed by hand` : ""}`;
    await writeStore(eventId, store);
  }
  return summary;
}

/**
 * Re-read the linked sheet and apply it. `force` skips the once-a-minute limit
 * that keeps every open of the tab from hitting Google.
 */
export async function syncSheet(eventId: string, force = false): Promise<ApplySummary | null> {
  await assertInternalEvent(eventId);
  const store = await readStore(eventId);
  if (!store.sheet) return null;
  if (!force && store.sheet.lastSyncAt && Date.now() - new Date(store.sheet.lastSyncAt).getTime() < SYNC_EVERY_MS) return null;
  const table = await readSheetTable(store.sheet.spreadsheetId, store.sheet.tab);
  return syncFromTable(eventId, table, `Read the RSVP sheet ${new Date().toLocaleString("en-US", { timeZone: "America/Denver", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`);
}

// ---------------------------------------------------------------------------
// Uploads: CSV, Excel, PDF.

/** A small CSV reader (quoted fields, doubled quotes, CRLF). Never a spreadsheet library - see the .csv rule in memory. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const PDF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["header", "rows"],
  properties: {
    header: { type: "array", items: { type: "string" } },
    rows: { type: "array", items: { type: "array", items: { type: "string" } } }
  }
} as const;

/** A PDF of responses (a printed sheet, a form summary) read into a table by Claude. */
async function pdfTable(bytes: Buffer): Promise<string[][]> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Reading a PDF needs the Anthropic key, which is not set on this server.");
  const client = new Anthropic();
  const stream = client.beta.messages.stream({
    model: process.env.GUEST_IMPORT_MODEL || "claude-opus-5-5",
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: [{ model: "claude-opus-4-8" }],
    system:
      "You read a PDF of party RSVP responses for SkyShare, a private aviation company, and return them as one table. Use the document's own column headings (for example Timestamp, Email Address, Name, Will you be joining us?, Plus one, Guest's name, Food allergies) and one row per response, cells copied exactly as written. If the PDF is a list of names with a status rather than a table, use the headings Name and Attending. Leave a cell empty when the document has nothing for it. Never invent a response.",
    output_config: { effort: "low", format: { type: "json_schema", schema: PDF_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } },
          { type: "text", text: "Return every response in this document as a table." }
        ]
      }
    ]
  });
  const response = await stream.finalMessage();
  if (response.stop_reason === "refusal") throw new Error("The PDF could not be read (the model declined it).");
  if (response.stop_reason === "max_tokens") throw new Error("That PDF is too long to read in one go. Split it into smaller files.");
  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  const parsed = JSON.parse(text || "{}") as { header?: string[]; rows?: string[][] };
  return [parsed.header ?? [], ...(parsed.rows ?? [])];
}

/** A file into normalized responses. Throws with a readable message. */
export async function readUpload(fileName: string, bytes: Buffer): Promise<ResponseRow[]> {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  let table: unknown[][];
  if (ext === "csv" || ext === "txt") table = parseCsv(bytes.toString("utf8"));
  else if (ext === "xlsx" || ext === "xls" || ext === "ods") {
    const wb = XLSX.read(bytes, { type: "buffer", cellDates: true });
    // The RSVP tab when there is one, else the first sheet.
    const name = wb.SheetNames.find((n) => n.trim().toLowerCase() === "rsvp") ?? wb.SheetNames[0];
    table = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: false, defval: "" });
  } else if (ext === "pdf") table = await pdfTable(bytes);
  else throw new Error("Upload a .csv, .xlsx, .xls or .pdf file.");
  const rows = rowsToResponses(table);
  if (!rows.length) throw new Error("No responses found in that file. It needs a heading row with an email or name column.");
  return rows;
}

// ---------------------------------------------------------------------------
// The reminder: one email, everyone in BCC.

export const DEFAULT_REMINDER_SUBJECT = "Reminder: are you coming to the SkyShare holiday party?";

export async function sendReminder(input: {
  eventId: string;
  newHireIds: string[];
  subject: string;
  bodyHtml: string;
  actor: string | null;
}): Promise<{ sent: number; skipped: string[]; mode: string }> {
  await assertInternalEvent(input.eventId);
  const ppl = await people();
  const byId = new Map(ppl.map((p) => [p.id, p]));
  const bcc: string[] = [];
  const skipped: string[] = [];
  for (const id of new Set(input.newHireIds)) {
    const p = byId.get(id);
    if (!p) continue;
    if (p.ssEmail) bcc.push(p.ssEmail);
    else skipped.push(p.name);
  }
  if (!bcc.length) throw new Error("None of them has a SkyShare email on file.");
  const subject = input.subject.replace(/\s+/g, " ").trim().slice(0, 200) || DEFAULT_REMINDER_SUBJECT;
  const body = cleanEditedBody(input.bodyHtml);
  if (!body.replace(/<[^>]*>/g, "").trim()) throw new Error("Write the message first.");
  // To the sending mailbox itself; everyone else blind-copied, so nobody sees the list.
  const to = [ORIENTATION_CHANNEL_ADDRESS];
  const mode = guardDecision({ to, bcc, subject }).mode;
  const channelId = await getOrientationChannelId();
  await sendEmail(channelId, { to, bcc, subject, body, archive: false });
  const store = await readStore(input.eventId);
  store.reminders = [...store.reminders, { at: new Date().toISOString(), by: input.actor, count: bcc.length, subject, mode }].slice(-50);
  await writeStore(input.eventId, store);
  return { sent: bcc.length, skipped, mode };
}
