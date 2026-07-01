import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";

type RouteContext = { params: Promise<{ roleId: string }> };

// Remove a role-history entry (correcting a mistake). After deleting, the most
// recent remaining role is re-opened as the current role and the person's
// headline position is re-synced, so the timeline stays contiguous.
export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const { roleId } = await context.params;

  try {
    const role = await prisma.roleAssignment.findUnique({ where: { id: roleId }, select: { newHireId: true } });
    if (!role) return NextResponse.json({ message: "Role not found." }, { status: 404 });
    const hireId = role.newHireId;

    await prisma.$transaction(async (tx) => {
      await tx.roleAssignment.delete({ where: { id: roleId } });
      const latest = await tx.roleAssignment.findFirst({
        where: { newHireId: hireId },
        orderBy: { startDate: "desc" },
        select: { id: true, title: true, endDate: true }
      });
      if (latest) {
        if (latest.endDate !== null) {
          await tx.roleAssignment.update({ where: { id: latest.id }, data: { endDate: null } });
        }
        await tx.newHire.update({ where: { id: hireId }, data: { position: latest.title } });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete role error:", error);
    return NextResponse.json({ message: "Unable to delete the role entry." }, { status: 500 });
  }
}
