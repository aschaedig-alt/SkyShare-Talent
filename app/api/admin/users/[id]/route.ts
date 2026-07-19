import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { VALID_ROLES, UserRole } from "@/lib/auth/permissions";
import { logActivity } from "@/lib/activity/logger";
import { blockEmail } from "@/lib/auth/blocklist";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("settings:admin");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json() as { role?: string };
  const { role } = body;

  // Validate role
  if (!role || !VALID_ROLES.includes(role as UserRole)) {
    return NextResponse.json({ message: "Invalid role" }, { status: 400 });
  }

  try {
    // Get current user to log activity
    const currentUser = auth.user;

    // Update user role
    const user = await prisma.user.update({
      where: { id },
      data: { role },
    });

    // Log the activity
    await logActivity({
      userId: currentUser?.id,
      userEmail: currentUser?.email || undefined,
      activityType: "PERMISSION_CHANGED",
      description: `Changed ${user.name || user.email}'s role to ${role}`,
      entityType: "User",
      entityId: id,
      metadata: { newRole: role, userId: id },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error("Error updating user role:", error);
    return NextResponse.json({ message: "Failed to update user role" }, { status: 500 });
  }
}

// DELETE /api/admin/users/[id] — fully remove a person's access (offboarding).
// Because sessions are JWT and sign-in is domain-gated, deleting the row alone
// wouldn't hold: their token would stay valid and they could sign back in. So
// this ADDS their email to the blocklist (which sign-in and every access gate
// now honor) AND deletes the account. Fenced: admin only, cannot remove yourself
// or the last admin, and the exact email must be typed to confirm. Reversible via
// "Restore access" (removes the block; they can sign in again as a new viewer).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("settings:admin");
  if (!auth.ok) {
    return NextResponse.json({ message: "Admin access is required." }, { status: 403 });
  }

  const { id } = await params;

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true }
  });
  if (!target) {
    return NextResponse.json({ message: "User not found." }, { status: 404 });
  }

  if (auth.user.id != null && target.id === auth.user.id) {
    return NextResponse.json({ message: "You cannot remove your own access." }, { status: 400 });
  }

  if (target.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return NextResponse.json({ message: "Cannot remove the last remaining admin." }, { status: 400 });
    }
  }

  const body = (await request.json().catch(() => ({}))) as { confirmEmail?: unknown };
  if (typeof body.confirmEmail !== "string" || body.confirmEmail.trim().toLowerCase() !== (target.email ?? "").toLowerCase()) {
    return NextResponse.json({ message: "Type the account's exact email to confirm." }, { status: 400 });
  }

  try {
    if (target.email) {
      await blockEmail(target.email);
    }
    await prisma.user.delete({ where: { id } });

    await logActivity({
      userId: auth.user?.id,
      userEmail: auth.user?.email || undefined,
      activityType: "USER_DELETED",
      description: `Removed access for ${target.email ?? target.name ?? id} (blocked + account deleted)`,
      entityType: "User",
      entityId: id
    });

    return NextResponse.json({ ok: true, message: "Access removed." });
  } catch (error) {
    console.error("Error removing user access:", error);
    return NextResponse.json({ message: "Failed to remove access." }, { status: 500 });
  }
}
