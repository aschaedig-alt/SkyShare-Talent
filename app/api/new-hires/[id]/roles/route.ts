import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { resolveFleetPosition } from "@/lib/fleet/positions";

type RouteContext = { params: Promise<{ id: string }> };

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

// Record a role change (promotion / upgrade / transition). Closes the person's
// current open role at the new start date and opens the new one, then syncs the
// NewHire.position so the rest of the app reflects their current role.
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const title = strOrNull(body.title);
    const startDate = parseDate(body.startDate);
    if (!title) return NextResponse.json({ message: "A role title is required." }, { status: 400 });
    if (!startDate) return NextResponse.json({ message: "A valid start date is required." }, { status: 400 });

    const hire = await prisma.newHire.findUnique({ where: { id }, select: { id: true } });
    if (!hire) return NextResponse.json({ message: "Employee not found." }, { status: 404 });

    // Resolve pilot seat/aircraft/slug: honor explicit values, else derive from the title.
    const fp = resolveFleetPosition(title);
    const slug = strOrNull(body.fleetPositionSlug) ?? fp?.slug ?? null;
    const seatRaw = strOrNull(body.seat)?.toUpperCase();
    const seat = seatRaw === "PIC" || seatRaw === "SIC" ? seatRaw : fp?.seat ?? null;
    const aircraft = strOrNull(body.aircraft) ?? fp?.aircraft ?? null;
    const department = strOrNull(body.department);
    const notes = strOrNull(body.notes);

    // The current (open) role, if any.
    const current = await prisma.roleAssignment.findFirst({
      where: { newHireId: id, endDate: null },
      orderBy: { startDate: "desc" },
      select: { id: true, startDate: true, seat: true }
    });

    if (current && startDate < current.startDate) {
      return NextResponse.json({ message: "The new role can't start before the current role began." }, { status: 400 });
    }

    // Derive the transition type when the client didn't specify one.
    const explicit = strOrNull(body.transitionType)?.toUpperCase();
    const derived = seat === "PIC" && (current?.seat ?? "").toUpperCase() === "SIC" ? "UPGRADE" : "PROMOTION";
    const transitionType = explicit ?? derived;

    await prisma.$transaction(async (tx) => {
      if (current) {
        await tx.roleAssignment.update({ where: { id: current.id }, data: { endDate: startDate } });
      }
      await tx.roleAssignment.create({
        data: { newHireId: id, title, fleetPositionSlug: slug, seat, aircraft, department, startDate, endDate: null, transitionType, notes }
      });
      // Keep the person's headline position in sync with their current role.
      await tx.newHire.update({ where: { id }, data: { position: title, ...(department ? { department } : {}) } });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Add role change error:", error);
    return NextResponse.json({ message: "Unable to record the role change." }, { status: 500 });
  }
}
