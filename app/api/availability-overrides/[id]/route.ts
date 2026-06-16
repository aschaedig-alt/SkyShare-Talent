import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("calendar:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  const { id } = await params;
  try {
    await prisma.availabilityOverride.delete({ where: { id } });
    return NextResponse.json({ ok: true, message: "Override removed." });
  } catch (error) {
    console.error("Delete override failed:", error);
    return NextResponse.json({ message: "Unable to delete override." }, { status: 500 });
  }
}
