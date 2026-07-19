import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { setDashboardHidden } from "@/lib/data/dashboard-hidden";

// POST /api/onboarding/dashboard-hidden — check a hire off (or back onto) the
// dashboard worklist. Shared across the team; reversible.
export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { id?: unknown; hidden?: unknown };
  if (typeof body.id !== "string" || !body.id) {
    return NextResponse.json({ message: "A hire id is required." }, { status: 400 });
  }
  await setDashboardHidden(body.id, body.hidden === true);
  return NextResponse.json({ ok: true });
}
