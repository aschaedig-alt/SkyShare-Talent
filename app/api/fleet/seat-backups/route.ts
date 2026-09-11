import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { getSeatBackups } from "@/lib/fleet/staffing/backups.server";

// Ranked outside candidates for one seat on the crew org chart — the "backup
// plan" panel's external half.
//
// TAKES A TITLE, NOT A GROUP INDEX. The chart is a client component holding a
// LOCAL draft of the roster: during an edit session, or straight after a
// duplicate, its group indexes no longer line up with the saved blob the server
// would read. positionLabel() is a pure module the client already imports, so
// the client resolves the seat to its label and sends that; the server never has
// to guess which roster the caller was looking at.
//
// Read-only. candidates:read, matching the people-search route beside it, since
// what comes back is candidate names and scores.
export async function GET(request: Request) {
  const auth = await requireApiPermission("candidates:read");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const title = new URL(request.url).searchParams.get("title")?.trim() ?? "";
  if (!title) {
    return NextResponse.json({ message: "A seat title is required." }, { status: 400 });
  }

  try {
    const backups = await getSeatBackups(title, auth.user.viewer);
    return NextResponse.json(backups);
  } catch (error) {
    console.error("Seat backups error:", error);
    return NextResponse.json({ message: "Unable to work out backup options for that seat." }, { status: 500 });
  }
}
