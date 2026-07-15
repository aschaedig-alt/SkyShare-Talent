import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { getCrewRoster, saveCrewRoster, resetCrewRoster } from "@/lib/fleet/staffing/roster.server";

// Admin editing for the Crew Org Chart roster. Lives under /api/workspace-settings
// so the existing middleware auth wall covers it; POST additionally requires the
// settings:admin permission (same gate as the other curated WorkspaceSetting
// editors). The chart READ is done server-side in the page, not here.
export const dynamic = "force-dynamic";

export async function GET() {
  const groups = await getCrewRoster();
  return NextResponse.json({ groups });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("settings:admin");
  if (!auth.ok) {
    return NextResponse.json({ message: "You do not have permission to edit the crew chart." }, { status: 401 });
  }

  try {
    const payload = await request.json();
    if (payload && typeof payload === "object" && (payload as { reset?: unknown }).reset === true) {
      const groups = await resetCrewRoster();
      return NextResponse.json({ groups });
    }
    const groups = await saveCrewRoster((payload as { groups?: unknown })?.groups);
    return NextResponse.json({ groups });
  } catch {
    return NextResponse.json({ message: "Unable to save the crew roster." }, { status: 500 });
  }
}
