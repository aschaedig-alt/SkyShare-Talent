import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { bookingTypeUpdateSchema } from "@/lib/validation/booking";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("calendar:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  const { id } = await params;
  try {
    const data = bookingTypeUpdateSchema.parse(await request.json());
    const type = await prisma.bookingType.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.kind !== undefined && { kind: data.kind }),
        ...(data.durationMinutes !== undefined && { durationMinutes: data.durationMinutes }),
        ...(data.bufferMinutes !== undefined && { bufferMinutes: data.bufferMinutes ?? null }),
        ...(data.location !== undefined && { location: data.location ?? null }),
        ...(data.description !== undefined && { description: data.description ?? null }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder })
      }
    });
    return NextResponse.json({ ok: true, type });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: "Validation failed.", issues: error.issues }, { status: 400 });
    }
    console.error("Update booking type failed:", error);
    return NextResponse.json({ message: "Unable to update booking type." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("calendar:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  const { id } = await params;
  try {
    await prisma.bookingType.delete({ where: { id } });
    return NextResponse.json({ ok: true, message: "Booking type removed." });
  } catch (error) {
    console.error("Delete booking type failed:", error);
    return NextResponse.json({ message: "Unable to delete booking type." }, { status: 500 });
  }
}
