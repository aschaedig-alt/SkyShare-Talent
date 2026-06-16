import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { bookingTypeSchema } from "@/lib/validation/booking";

const createSchema = bookingTypeSchema.extend({ hostId: z.string().min(1) });

/** Admin: create a booking type for a host. */
export async function POST(request: Request) {
  const auth = await requireApiPermission("calendar:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  try {
    const data = createSchema.parse(await request.json());
    const host = await prisma.bookingHost.findUnique({ where: { id: data.hostId }, select: { id: true } });
    if (!host) return NextResponse.json({ message: "Host not found." }, { status: 404 });

    const type = await prisma.bookingType.create({
      data: {
        hostId: data.hostId,
        name: data.name,
        kind: data.kind,
        durationMinutes: data.durationMinutes,
        bufferMinutes: data.bufferMinutes ?? null,
        location: data.location ?? null,
        description: data.description ?? null,
        isActive: data.isActive,
        sortOrder: data.sortOrder
      }
    });
    return NextResponse.json({ ok: true, type });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: "Validation failed.", issues: error.issues }, { status: 400 });
    }
    console.error("Create booking type failed:", error);
    return NextResponse.json({ message: "Unable to create booking type." }, { status: 500 });
  }
}
