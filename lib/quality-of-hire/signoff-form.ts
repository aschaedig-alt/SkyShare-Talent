import { google } from "googleapis";

// ---------------------------------------------------------------------------
// The Quality of Hire definitions sign-off - milestone 2 (due Nov 19 2026). The
// hiring managers answer a Google Form, built Nov 21 2026 by an Apps Script in
// aschaedig@'s Drive from the questions on the sign-off page. His ask, the same day:
// "store these links where i can find them" and "the data from the answers
// imported into my app so its easier to read".
//
// So Reports > Sign-off shows the links, and reads the answers LIVE from the form's
// answers Sheet on every load - no copy in the database to go stale or to undo.
// The Sheet is shared Viewer with the app's own Google service account
// (GOOGLE_SERVICE_ACCOUNT_EMAIL, the account the calendar sync and the fleet sheet
// scan use), granted Nov 21 by the Apps Script's addViewer.
//
// Columns are read from the Sheet's own header row, so rewording a question in the
// form (he reworded 2, 5 and 12 the day it was built) shows up as it is. A question
// is recognized by its number ("7. ..."): 1-9 are pick-one, 11 is tick-all,
// 10, 12, 13 and "Anything else?" are written answers.
// ---------------------------------------------------------------------------

export const SIGNOFF_LINKS = {
  send: "https://docs.google.com/forms/d/e/1FAIpQLSc0yWoXgUbGzMxBIRVosOXaIpQLTXnv0414fgztQrM0H7TNZQ/viewform",
  edit: "https://docs.google.com/forms/d/1k8dGno0V16V8pD22e1xg-fCBAma06RQLf3rqGs7_xoc/edit",
  answers: "https://docs.google.com/spreadsheets/d/11edPbA6TeudyFdMf4tatce5K_7L5ZJ1AJIzzB9k_0iI/edit",
  page: "https://claude.ai/artifact/4QTzmvR92JLwxFiWZTMqdZ"
} as const;

const ANSWERS_SHEET_ID = "11edPbA6TeudyFdMf4tatce5K_7L5ZJ1AJIzzB9k_0iI";

/** The 15 departments on the sign-off page, in its order. */
export const SIGNOFF_DEPARTMENTS = [
  "Pilots: light and midsize", "Pilots: heavy", "Managed aircraft crew", "Cabin attendants", "Maintenance",
  "SkyOps", "OGD FBO", "DVO FBO", "SVR FBO", "Accounting and Finance", "Sales", "Marketing", "Detailing",
  "Safety", "Human Resources"
];

/**
 * Question 11's tick-boxes, word for word as the form offers them (he reworded one
 * to "Core value ratings ..." on Nov 21). The Sheet joins ticks with ", " and some
 * boxes contain commas themselves, so each tick is matched against this list; a box
 * reworded in the form and not here is not lost - it shows under "Other".
 */
const SCORECARD_CHOICES = [
  "Good-hire rate", "Bad-hire rate", "Left within 90 days", "Left within a year (quit and let go)", "Interviews per hire",
  "Application to offer (days)", "Offers turned down, with the reason", "Accepted, never started",
  "Core value ratings at 3, 6 and 12 months", "Interview accuracy (interview scores vs later scores and results)"
];

export type SignoffResponse = { at: string; name: string; departments: string[] };
export type Who = { name: string; departments: string[] };
export type SignoffQuestion = {
  num: number | null;
  title: string;
  kind: "choice" | "multi" | "text";
  /** Pick-one and tick-all: each answer given, most picked first, with who picked it. */
  tallies: { choice: string; people: Who[] }[];
  /** Written answers, and anything typed into "Other". */
  texts: { who: Who; text: string }[];
};
export type SignoffAnswers =
  | { ok: true; responses: SignoffResponse[]; questions: SignoffQuestion[]; covered: string[]; missing: string[]; readAt: string }
  | { ok: false; error: string };

/** Split a tick-all cell ("A, B, Something typed") against the known choices; the rest is the Other text. */
function splitTicks(cell: string, known: string[]): { picked: string[]; other: string | null } {
  let rest = cell.trim();
  const picked: string[] = [];
  // Longest first, so a choice that contains another is taken whole.
  for (const k of [...known].sort((a, b) => b.length - a.length)) {
    const i = rest.indexOf(k);
    if (i === -1) continue;
    picked.push(k);
    rest = (rest.slice(0, i) + rest.slice(i + k.length)).replace(/^[,\s]+|[,\s]+$/g, "").replace(/,\s*,/g, ",");
  }
  return { picked: known.filter((k) => picked.includes(k)), other: rest.trim() || null };
}

const numOf = (title: string) => {
  const m = title.match(/^\s*(\d+)\./);
  return m ? Number(m[1]) : null;
};

export async function readSignoffAnswers(): Promise<SignoffAnswers> {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    return { ok: false, error: "The app's Google service account is not set up here, so the answers Sheet cannot be read." };
  }
  try {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
    });
    const sheets = google.sheets({ version: "v4", auth });
    const meta = await sheets.spreadsheets.get({ spreadsheetId: ANSWERS_SHEET_ID, fields: "sheets.properties.title" });
    // The form writes to its own tab ("Form Responses 1"); fall back to the first tab.
    const titles = (meta.data.sheets ?? []).map((s) => s.properties?.title ?? "");
    const tab = titles.find((t) => /^Form Responses/i.test(t)) ?? titles[0];
    if (!tab) return { ok: false, error: "The answers Sheet has no tabs." };
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: ANSWERS_SHEET_ID, range: `'${tab.replace(/'/g, "''")}'!A1:ZZ1000` });
    const values = (res.data.values ?? []).map((r) => r.map((c) => String(c ?? "")));
    const header = values[0] ?? [];
    const rows = values.slice(1).filter((r) => r.some((c) => c.trim()));

    const col = (re: RegExp) => header.findIndex((h) => re.test(h));
    const nameCol = col(/your name/i);
    const deptCol = col(/department\(s\)|which department/i);

    const responses: SignoffResponse[] = rows.map((r) => {
      const { picked, other } = splitTicks(r[deptCol] ?? "", SIGNOFF_DEPARTMENTS);
      return { at: r[0] ?? "", name: (r[nameCol] ?? "").trim() || "No name given", departments: other ? [...picked, other] : picked };
    });
    const whoOf = (i: number): Who => ({ name: responses[i].name, departments: responses[i].departments });

    const questions: SignoffQuestion[] = [];
    header.forEach((title, c) => {
      if (c === 0 || c === nameCol || c === deptCol || !title.trim()) return;
      const num = numOf(title);
      const kind: SignoffQuestion["kind"] = num === 11 ? "multi" : num !== null && num >= 1 && num <= 9 ? "choice" : "text";
      const q: SignoffQuestion = { num, title: title.trim(), kind, tallies: [], texts: [] };
      const byChoice = new Map<string, Who[]>();
      rows.forEach((r, i) => {
        const cell = (r[c] ?? "").trim();
        if (!cell) return;
        if (kind === "text") {
          q.texts.push({ who: whoOf(i), text: cell });
        } else if (kind === "multi") {
          const { picked, other } = splitTicks(cell, SCORECARD_CHOICES);
          picked.forEach((p) => byChoice.set(p, [...(byChoice.get(p) ?? []), whoOf(i)]));
          if (other) q.texts.push({ who: whoOf(i), text: other });
        } else {
          byChoice.set(cell, [...(byChoice.get(cell) ?? []), whoOf(i)]);
        }
      });
      q.tallies = [...byChoice.entries()].map(([choice, people]) => ({ choice, people })).sort((a, b) => b.people.length - a.people.length);
      questions.push(q);
    });

    const covered = SIGNOFF_DEPARTMENTS.filter((d) => responses.some((r) => r.departments.includes(d)));
    return { ok: true, responses, questions, covered, missing: SIGNOFF_DEPARTMENTS.filter((d) => !covered.includes(d)), readAt: new Date().toISOString() };
  } catch (e) {
    const code = (e as { code?: number }).code;
    return {
      ok: false,
      error:
        code === 403 || code === 404
          ? "The app cannot open the answers Sheet. It must stay shared (Viewer) with skyshare-calendar-sync@skyshare-talent.iam.gserviceaccount.com."
          : `The answers Sheet could not be read: ${(e as Error).message.slice(0, 160)}`
    };
  }
}
