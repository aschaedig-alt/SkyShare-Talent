import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { VALID_ROLES } from "@/lib/auth/permissions";
import { logActivity } from "@/lib/activity/logger";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("settings:admin");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { role } = body;

  // Validate role
  if (!role || !VALID_ROLES.includes(role as any)) {
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
