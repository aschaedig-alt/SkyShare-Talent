import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { isTestEmail } from "@/lib/testdata/markers";
import { logActivity } from "@/lib/activity/logger";

// DELETE /api/users/[id] — remove an auth login account. TEST-DATA-ONLY teardown
// on a shared live database, so it is fenced four ways: admin only, the target
// must be a test account (email marker), it cannot be you, it cannot be the last
// admin, and the caller must type the exact email to confirm. Accounts, sessions
// and permissions cascade at the DB level; notes/audit/activity are left with a
// null author rather than deleted, so history the person touched survives.
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

  if (!isTestEmail(target.email)) {
    return NextResponse.json(
      { message: "Only test accounts can be deleted (email must be a +test sub-address or a reserved test domain)." },
      { status: 403 }
    );
  }

  if (auth.user.id != null && target.id === auth.user.id) {
    return NextResponse.json({ message: "You cannot delete your own account." }, { status: 400 });
  }

  if (target.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return NextResponse.json({ message: "Cannot delete the last remaining admin." }, { status: 400 });
    }
  }

  const body = (await request.json().catch(() => ({}))) as { confirmEmail?: unknown };
  if (typeof body.confirmEmail !== "string" || body.confirmEmail.trim().toLowerCase() !== (target.email ?? "").toLowerCase()) {
    return NextResponse.json({ message: "Type the account's exact email to confirm deletion." }, { status: 400 });
  }

  try {
    await prisma.user.delete({ where: { id } });

    await logActivity({
      userId: auth.user?.id,
      userEmail: auth.user?.email || undefined,
      activityType: "USER_DELETED",
      description: `Deleted TEST user ${target.email ?? target.name ?? id}`,
      entityType: "User",
      entityId: id
    });

    return NextResponse.json({ ok: true, message: "Test user deleted." });
  } catch (error) {
    console.error("Error deleting user:", error);
    return NextResponse.json({ message: "Failed to delete user." }, { status: 500 });
  }
}
