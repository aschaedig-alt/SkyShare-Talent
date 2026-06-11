import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";

const VALID_STATUSES = ["NEW", "REVIEWING", "DONE"];

// Update feedback status — admins only
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("settings:admin");
  if (!auth.ok) {
    return (auth as { ok: false; response: Response }).response;
  }

  const { id } = await params;

  try {
    const body = (await request.json()) as { status?: string };
    if (!body.status || !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ message: "Invalid status." }, { status: 400 });
    }

    const updated = await prisma.feedback.update({
      where: { id },
      data: { status: body.status },
      select: { id: true, status: true }
    });

    return NextResponse.json({ ok: true, ...updated });
  } catch (error) {
    console.error("Error updating feedback:", error);
    return NextResponse.json({ message: "Unable to update feedback." }, { status: 500 });
  }
}

// Delete feedback — admins only
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("settings:admin");
  if (!auth.ok) {
    return (auth as { ok: false; response: Response }).response;
  }

  const { id } = await params;

  try {
    await prisma.feedback.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting feedback:", error);
    return NextResponse.json({ message: "Unable to delete feedback." }, { status: 500 });
  }
}
