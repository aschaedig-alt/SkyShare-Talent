import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { overrideSchema } from "@/lib/validation/booking";

/** Parse "YYYY-MM-DD" as a UTC-midnight Date for a @db.Date column. */
function toDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Admin: list overrides (optionally filter by host; org-wide always included). */
export async function GET(request: Request) {
  const auth = await requireApiPermission("calendar:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  const hostId = new URL(request.url).searchParams.get("hostId");
  const overrides = await prisma.availabilityOverride.findMany({
    where: hostId ? { OR: [{ hostId }, { hostId: null }] } : {},
    orderBy: { startDate: "asc" }
  });
  return NextResponse.json({ overrides });
}

/** Admin: add a vacation/holiday block or custom-hours override (hostId null = org-wide). */
export async function POST(request: Request) {
  const auth = await requireApiPermission("calendar:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  try {
    const data = overrideSchema.parse(await request.json());
    const start = toDateOnly(data.startDate);
    const end = toDateOnly(data.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      return NextResponse.json({ message: "Invalid date range." }, { status: 400 });
    }

    if (data.hostId) {
      const host = await prisma.bookingHost.findUnique({ where: { id: data.hostId }, select: { id: true } });
      if (!host) return NextResponse.json({ message: "Host not found." }, { status: 404 });
    }

    const override = await prisma.availabilityOverride.create({
      data: {
        hostId: data.hostId ?? null,
        startDate: start,
        endDate: end,
        kind: data.kind,
        startMinute: data.kind === "CUSTOM" ? data.startMinute ?? null : null,
        endMinute: data.kind === "CUSTOM" ? data.endMinute ?? null : null,
        label: data.label ?? null
      }
    });
    return NextResponse.json({ ok: true, override });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: "Validation failed.", issues: error.issues }, { status: 400 });
    }
    console.error("Create override failed:", error);
    return NextResponse.json({ message: "Unable to create override." }, { status: 500 });
  }
}
