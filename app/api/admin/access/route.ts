import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { getBlockedEmails, unblockEmail } from "@/lib/auth/blocklist";
import { logActivity } from "@/lib/activity/logger";

// GET /api/admin/access — the list of revoked (blocked) emails.
export async function GET() {
  const auth = await requireApiPermission("settings:admin");
  if (!auth.ok) {
    return NextResponse.json({ message: "Admin access is required." }, { status: 403 });
  }
  return NextResponse.json({ blocked: await getBlockedEmails() });
}

// DELETE /api/admin/access — restore access for a blocked email (removes the
// block). They can sign in again; a fresh viewer account is created on next login.
export async function DELETE(request: Request) {
  const auth = await requireApiPermission("settings:admin");
  if (!auth.ok) {
    return NextResponse.json({ message: "Admin access is required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { email?: unknown };
  if (typeof body.email !== "string" || !body.email.trim()) {
    return NextResponse.json({ message: "An email is required." }, { status: 400 });
  }

  await unblockEmail(body.email);

  await logActivity({
    userId: auth.user?.id,
    userEmail: auth.user?.email || undefined,
    activityType: "PERMISSION_CHANGED",
    description: `Restored access for ${body.email.trim().toLowerCase()}`,
    entityType: "User",
    entityId: body.email.trim().toLowerCase()
  });

  return NextResponse.json({ ok: true, message: "Access restored." });
}
