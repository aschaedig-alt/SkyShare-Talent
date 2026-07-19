import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { MAINTENANCE_GROUP } from "@/lib/onboarding/tasks";
import { maybeArchiveOnCheckinsComplete } from "@/lib/data/onboarding";

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

    // Completing a check-in may be the last one — auto-archive if so.
    let archived = false;
    if (updated.group === MAINTENANCE_GROUP && status === "DONE") {
      archived = await maybeArchiveOnCheckinsComplete(updated.newHireId);
    }

    return NextResponse.json({ ok: true, task: { id: updated.id, status: updated.status }, archived });
  } catch (error) {
    console.error("Onboarding task update error:", error);
    return NextResponse.json({ message: "Unable to update task." }, { status: 500 });
  }
}
