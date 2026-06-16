import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { weeklyRulesSchema } from "@/lib/validation/booking";

/** Admin: replace a host's entire weekly recurring schedule in one call. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("calendar:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  const { id } = await params;
  try {
    const { rules } = weeklyRulesSchema.parse(await request.json());

    const host = await prisma.bookingHost.findUnique({ where: { id }, select: { id: true } });
    if (!host) return NextResponse.json({ message: "Host not found." }, { status: 404 });

    await prisma.$transaction([
      prisma.availabilityRule.deleteMany({ where: { hostId: id } }),
      prisma.availabilityRule.createMany({
        data: rules.map((r) => ({
          hostId: id,
          dayOfWeek: r.dayOfWeek,
          startMinute: r.startMinute,
          endMinute: r.endMinute
        }))
      })
    ]);

    const weeklyRules = await prisma.availabilityRule.findMany({
      where: { hostId: id },
      orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }]
    });
    return NextResponse.json({ ok: true, weeklyRules });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: "Validation failed.", issues: error.issues }, { status: 400 });
    }
    console.error("Update availability failed:", error);
    return NextResponse.json({ message: "Unable to update availability." }, { status: 500 });
  }
}
