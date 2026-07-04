import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { resolveFleetPosition } from "@/lib/fleet/positions";

type RouteContext = { params: Promise<{ roleId: string }> };

function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function strOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const t = String(value).trim();
  return t.length ? t : null;
}

// Edit an existing role-history entry (correcting an approximate date, a title,
// or a transition). Re-derives the pilot seat/aircraft from the title when the
// title changes, keeps the headline position synced to the latest role, and
// guards against an end date that precedes the start.
export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const { roleId } = await context.params;

  try {
    const role = await prisma.roleAssignment.findUnique({
      where: { id: roleId },
      select: { id: true, newHireId: true, title: true, seat: true, aircraft: true, fleetPositionSlug: true }
    });
    if (!role) return NextResponse.json({ message: "Role not found." }, { status: 404 });

    const body = (await request.json()) as Record<string, unknown>;
    const title = strOrNull(body.title) ?? role.title;
    const startDate = parseDate(body.startDate);
    if (!startDate) return NextResponse.json({ message: "A valid start date is required." }, { status: 400 });
    const endDate = parseDate(body.endDate); // null = current/open
    if (endDate && endDate.getTime() < startDate.getTime()) {
      return NextResponse.json({ message: "The end date can't be before the start date." }, { status: 400 });
    }

    // When the title changes, re-derive seat/aircraft/slug from the fleet registry
    // (honoring any explicit override); otherwise keep the stored values.
    const titleChanged = title !== role.title;
    const fp = resolveFleetPosition(title);
    const seatRaw = strOrNull(body.seat)?.toUpperCase();
    const seat = seatRaw === "PIC" || seatRaw === "SIC" ? seatRaw : titleChanged ? fp?.seat ?? null : role.seat;
    const aircraft = strOrNull(body.aircraft) ?? (titleChanged ? fp?.aircraft ?? null : role.aircraft);
    const slug = strOrNull(body.fleetPositionSlug) ?? (titleChanged ? fp?.slug ?? null : role.fleetPositionSlug);
    const transitionType = strOrNull(body.transitionType)?.toUpperCase();
    const department = body.department === undefined ? undefined : strOrNull(body.department);

    await prisma.$transaction(async (tx) => {
      await tx.roleAssignment.update({
        where: { id: roleId },
        data: {
          title,
          startDate,
          endDate,
          seat,
          aircraft,
          fleetPositionSlug: slug,
          ...(transitionType ? { transitionType } : {}),
          ...(department !== undefined ? { department } : {})
        }
      });
      // Keep the headline position in sync with the person's latest role.
      const latest = await tx.roleAssignment.findFirst({
        where: { newHireId: role.newHireId },
        orderBy: { startDate: "desc" },
        select: { title: true }
      });
      if (latest) await tx.newHire.update({ where: { id: role.newHireId }, data: { position: latest.title } });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Edit role error:", error);
    return NextResponse.json({ message: "Unable to update the role." }, { status: 500 });
  }
}

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
