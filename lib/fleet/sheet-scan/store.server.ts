import { prisma } from "@/lib/prisma";
import { getCrewRoster } from "@/lib/fleet/staffing/roster.server";
import { compareSheetToChart, type CompareResult } from "./compare";
import { isSheetScanConfigured, readAircraftTabs } from "./sheet.server";

/**
 * The daily scan's result and every decision made on it, in ONE WorkspaceSetting
 * (scope "fleet", key "crew-sheet-scan") — no migration on the shared database.
 * Its own key, never the roster's: a scan only ever writes suggestions. The
 * roster changes only when a person presses "Use suggestion" or saves a
 * modified one, through the chart's normal save.
 */
const SCOPE = "fleet";
const KEY = "crew-sheet-scan";

export type ScanDecision = { decision: "kept" | "applied" | "modified"; at: string; by: string | null };
export type ScanState = {
  scannedAt: string | null;
  error: string | null;
  result: CompareResult | null;
  /** Suggestion id -> what was decided. Kept across scans, so "keep as is" sticks. */
  decided: Record<string, ScanDecision>;
};

const EMPTY: ScanState = { scannedAt: null, error: null, result: null, decided: {} };

export async function getScanState(): Promise<ScanState> {
  const row = await prisma.workspaceSetting.findFirst({ where: { scope: SCOPE, key: KEY }, select: { valueJson: true } });
  if (!row?.valueJson) return EMPTY;
  try {
    const v = JSON.parse(row.valueJson) as Partial<ScanState>;
    return { scannedAt: v.scannedAt ?? null, error: v.error ?? null, result: v.result ?? null, decided: v.decided ?? {} };
  } catch {
    return EMPTY;
  }
}

async function save(state: ScanState) {
  const valueJson = JSON.stringify(state);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson },
    update: { valueJson }
  });
}

/** Compare the sheet with the live chart right now, without storing anything. */
export async function compareNow(): Promise<CompareResult> {
  const [{ groups }, tabs] = await Promise.all([getCrewRoster(), readAircraftTabs()]);
  return compareSheetToChart(groups, tabs);
}

/**
 * Run the scan and store it. A failure is stored too (with the last good result
 * kept), so the chart can say "the last scan failed" instead of quietly showing
 * yesterday's suggestions as if they were today's.
 */
export async function runScan(): Promise<ScanState> {
  const prev = await getScanState();
  if (!isSheetScanConfigured()) {
    const state = { ...prev, error: "The Google service account is not configured on this server." };
    await save(state);
    return state;
  }
  try {
    const result = await compareNow();
    // Forget decisions for suggestions that no longer exist, so the map cannot
    // grow forever; a decision on a live suggestion is kept.
    const live = new Set(result.suggestions.map((s) => s.id));
    const decided = Object.fromEntries(Object.entries(prev.decided).filter(([id]) => live.has(id)));
    const state: ScanState = { scannedAt: new Date().toISOString(), error: null, result, decided };
    await save(state);
    return state;
  } catch (e) {
    const state = { ...prev, error: `The scan could not read the sheet: ${e instanceof Error ? e.message : String(e)}` };
    await save(state);
    return state;
  }
}

/** Record what a person chose for one suggestion. */
export async function recordDecision(id: string, decision: ScanDecision["decision"], by: string | null): Promise<ScanState> {
  const state = await getScanState();
  state.decided[id] = { decision, at: new Date().toISOString(), by };
  await save(state);
  return state;
}
