import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { hostCreateSchema } from "@/lib/validation/booking";

/** Admin: list all booking hosts with counts. */
export async function GET() {
  const auth = await requireApiPermission("calendar:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  const hosts = await prisma.bookingHost.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { bookingTypes: true, bookings: true, weeklyRules: true } }
    }
  });
  return NextResponse.json({ hosts });
}

// Default schedule for a brand-new host: Mon–Fri 9:00–17:00 (host tz).
const DEFAULT_WEEKLY = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startMinute: 9 * 60,
  endMinute: 17 * 60
}));

/** Admin: create a host (seeded with Mon–Fri 9–5 availability). */
export async function POST(request: Request) {
  const auth = await requireApiPermission("calendar:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  try {
    const data = hostCreateSchema.parse(await request.json());

    const existing = await prisma.bookingHost.findUnique({ where: { slug: data.slug }, select: { id: true } });
    if (existing) {
      return NextResponse.json({ message: "That link slug is already taken." }, { status: 409 });
    }

    const host = await prisma.bookingHost.create({
      data: {
        name: data.name,
        slug: data.slug,
        email: data.email ?? null,
        role: data.role,
        title: data.title ?? null,
        avatarUrl: data.avatarUrl ?? null,
        timezone: data.timezone,
        calendarId: data.calendarId ?? null,
        minNoticeHours: data.minNoticeHours,
        bookingWindowDays: data.bookingWindowDays,
        maxPerDay: data.maxPerDay ?? null,
        bufferMinutes: data.bufferMinutes,
        isActive: data.isActive,
        weeklyRules: { create: DEFAULT_WEEKLY }
      },
      include: { weeklyRules: true, bookingTypes: true }
    });

    return NextResponse.json({ ok: true, host });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: "Validation failed.", issues: error.issues }, { status: 400 });
    }
    console.error("Create host failed:", error);
    return NextResponse.json({ message: "Unable to create host." }, { status: 500 });
  }
}
