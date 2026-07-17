import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { getMxRoster, saveMxRoster, resetMxRoster } from "@/lib/fleet/staffing/mx-roster.server";

// Admin editing for the Maintenance Org Chart roster. Mirrors the crew-roster
// route: lives under /api/workspace-settings so the middleware auth wall covers
// it; POST additionally requires settings:admin.
export const dynamic = "force-dynamic";

export async function GET() {
  const roster = await getMxRoster();
  return NextResponse.json(roster);
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("settings:admin");
  if (!auth.ok) {
    return NextResponse.json({ message: "You do not have permission to edit the maintenance chart." }, { status: 401 });
  }

  try {
    const payload = await request.json();
    if (payload && typeof payload === "object" && (payload as { reset?: unknown }).reset === true) {
      const roster = await resetMxRoster();
      return NextResponse.json(roster);
    }
    const roster = await saveMxRoster((payload as { groups?: unknown; links?: unknown }) ?? {});
    return NextResponse.json(roster);
  } catch {
    return NextResponse.json({ message: "Unable to save the maintenance roster." }, { status: 500 });
  }
}
