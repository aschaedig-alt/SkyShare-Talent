import { requireModulePageAccess } from "@/lib/data/module-access";
import { hasPermission } from "@/lib/auth/roles";
import { getCrewRoster } from "@/lib/fleet/staffing/roster.server";
import { compareNow, getScanState, type ScanState } from "@/lib/fleet/sheet-scan/store.server";
import { isSheetScanConfigured } from "@/lib/fleet/sheet-scan/sheet.server";
import CrewOrgChart from "@/components/fleet/orgchart/CrewOrgChart";

export const dynamic = "force-dynamic";

/**
 * The sheet check is for the people who can edit the chart. Until the daily
 * scan has stored a result, the page compares on the spot — read-only, nothing
 * stored — so the panel is useful from the first visit; once a scan is stored
 * the page just reads it and never calls Google while rendering.
 */
async function loadSheetScan(): Promise<{ state: ScanState; unsaved: boolean } | null> {
  const stored = await getScanState();
  if (stored.scannedAt || stored.error) return { state: stored, unsaved: false };
  if (!isSheetScanConfigured()) return { state: { ...stored, error: "The Google service account is not configured on this server, so the sheet cannot be read." }, unsaved: false };
  try {
    return { state: { ...stored, result: await compareNow() }, unsaved: true };
  } catch (e) {
    return { state: { ...stored, error: `Could not read the sheet: ${e instanceof Error ? e.message : String(e)}` }, unsaved: false };
  }
}

export default async function CrewOrgChartPage() {
  const { role } = await requireModulePageAccess("fleet");
  const { groups, links, training, leadership } = await getCrewRoster();
  const canEdit = hasPermission(role, "settings:admin");
  const sheetScan = canEdit ? await loadSheetScan() : null;
  return (
    <div className="p-4 md:p-6">
      <CrewOrgChart
        initialGroups={groups}
        initialLinks={links}
        initialTraining={training}
        initialLeadership={leadership}
        initialSheetScan={sheetScan?.state}
        sheetScanUnsaved={sheetScan?.unsaved ?? false}
        canEdit={canEdit}
      />
    </div>
  );
}
