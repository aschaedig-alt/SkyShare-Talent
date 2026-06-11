import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";

type RouteContext = { params: Promise<{ id: string }> };

const VALID = ["TODO", "DONE", "NA"] as const;

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const body = (await request.json()) as { status?: string };
    const status = body.status;
    if (!status || !VALID.includes(status as (typeof VALID)[number])) {
      return NextResponse.json({ message: "Invalid status." }, { status: 400 });
    }

    const updated = await prisma.onboardingTask.update({
      where: { id },
      data: { status, completedAt: status === "DONE" ? new Date() : null }
    });

    return NextResponse.json({ ok: true, task: { id: updated.id, status: updated.status } });
  } catch (error) {
    console.error("Onboarding task update error:", error);
    return NextResponse.json({ message: "Unable to update task." }, { status: 500 });
  }
}
