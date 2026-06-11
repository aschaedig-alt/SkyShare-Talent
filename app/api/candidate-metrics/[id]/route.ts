import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";

type RouteContext = { params: Promise<{ id: string }> };

// Accept (optionally edit value), edit, or dismiss a suggested/confirmed metric.
export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const body = (await request.json()) as {
      action?: "accept" | "dismiss";
      valueNumber?: number | null;
      valueText?: string | null;
    };

    const existing = await prisma.candidateMetric.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ message: "Metric not found." }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (body.action === "accept") data.status = "CONFIRMED";
    if (body.action === "dismiss") data.status = "DISMISSED";
    if (body.valueNumber !== undefined) data.valueNumber = body.valueNumber;
    if (body.valueText !== undefined) data.valueText = body.valueText;

    const updated = await prisma.candidateMetric.update({ where: { id }, data });
    return NextResponse.json({ ok: true, metric: updated });
  } catch (error) {
    console.error("Metric update error:", error);
    return NextResponse.json({ message: "Unable to update metric." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  try {
    await prisma.candidateMetric.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Metric delete error:", error);
    return NextResponse.json({ message: "Unable to delete metric." }, { status: 500 });
  }
}
