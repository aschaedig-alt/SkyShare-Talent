import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { hostUpdateSchema } from "@/lib/validation/booking";

/** Admin: full host detail incl. weekly rules, types, and applicable overrides. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("calendar:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  const { id } = await params;
  const host = await prisma.bookingHost.findUnique({
    where: { id },
    include: {
      weeklyRules: { orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] },
      bookingTypes: { orderBy: { sortOrder: "asc" } }
    }
  });
  if (!host) return NextResponse.json({ message: "Host not found." }, { status: 404 });

  const overrides = await prisma.availabilityOverride.findMany({
    where: { OR: [{ hostId: id }, { hostId: null }] },
    orderBy: { startDate: "asc" }
  });

  return NextResponse.json({ host, overrides });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("calendar:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  const { id } = await params;
  try {
    const data = hostUpdateSchema.parse(await request.json());

    if (data.slug) {
      const clash = await prisma.bookingHost.findFirst({
        where: { slug: data.slug, id: { not: id } },
        select: { id: true }
      });
      if (clash) return NextResponse.json({ message: "That link slug is already taken." }, { status: 409 });
    }

    const host = await prisma.bookingHost.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.slug !== undefined && { slug: data.slug }),
        ...(data.email !== undefined && { email: data.email ?? null }),
        ...(data.role !== undefined && { role: data.role }),
        ...(data.title !== undefined && { title: data.title ?? null }),
        ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl ?? null }),
        ...(data.timezone !== undefined && { timezone: data.timezone }),
        ...(data.calendarId !== undefined && { calendarId: data.calendarId ?? null }),
        ...(data.minNoticeHours !== undefined && { minNoticeHours: data.minNoticeHours }),
        ...(data.bookingWindowDays !== undefined && { bookingWindowDays: data.bookingWindowDays }),
        ...(data.maxPerDay !== undefined && { maxPerDay: data.maxPerDay ?? null }),
        ...(data.bufferMinutes !== undefined && { bufferMinutes: data.bufferMinutes }),
        ...(data.isActive !== undefined && { isActive: data.isActive })
      }
    });
    return NextResponse.json({ ok: true, host });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: "Validation failed.", issues: error.issues }, { status: 400 });
    }
    console.error("Update host failed:", error);
    return NextResponse.json({ message: "Unable to update host." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("calendar:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  const { id } = await params;
  try {
    await prisma.bookingHost.delete({ where: { id } });
    return NextResponse.json({ ok: true, message: "Host removed." });
  } catch (error) {
    console.error("Delete host failed:", error);
    return NextResponse.json({ message: "Unable to delete host." }, { status: 500 });
  }
}
