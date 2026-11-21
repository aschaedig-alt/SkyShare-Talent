import { google } from "googleapis";
import { SHEET_ID, SHEET_TABS } from "./compare";

/**
 * Read the per-aircraft tabs of "Recruiting Status Tracking" as the app's own
 * Google service account (GOOGLE_SERVICE_ACCOUNT_EMAIL / _PRIVATE_KEY — the same
 * account the calendar sync uses). Read-only scope. The sheet is shared with
 * that account as Viewer (Nov 3); nothing here can change it.
 *
 * Why the service account and not the Drive connector a Claude session has: the
 * connector's read returns about five sample rows per tab, and its text export
 * returns only the first tab. Measured Nov 3: the Sheets API returns every row
 * of all 21 tabs (G200: 7 named captains, against 3 in the sample).
 */
export function isSheetScanConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
}

/**
 * `missing` names every expected tab the sheet no longer has. Until Nov 21 2026 one
 * renamed tab ("CJ" became "CJ GA") made batchGet reject the WHOLE read with
 * "Unable to parse range", so the panel showed only that error for eleven days and
 * no tab was checked. Now the existing tabs are read and the missing ones named.
 */
export async function readAircraftTabs(): Promise<{ tabs: Record<string, unknown[][]>; missing: string[] }> {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });
  const sheets = google.sheets({ version: "v4", auth });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: "sheets.properties.title" });
  const present = new Set((meta.data.sheets ?? []).map((s) => s.properties?.title ?? ""));
  const expected = Object.keys(SHEET_TABS);
  const missing = expected.filter((t) => !present.has(t));
  const tabs = expected.filter((t) => present.has(t));
  if (!tabs.length) return { tabs: {}, missing };
  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SHEET_ID,
    // A1:L80 covers every block on every tab with room to grow (the deepest,
    // PC-12, reaches row 33 today).
    ranges: tabs.map((t) => `'${t.replace(/'/g, "''")}'!A1:L80`)
  });
  const out: Record<string, unknown[][]> = {};
  (res.data.valueRanges ?? []).forEach((vr, i) => {
    out[tabs[i]] = (vr.values ?? []) as unknown[][];
  });
  return { tabs: out, missing };
}
