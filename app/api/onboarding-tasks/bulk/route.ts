import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { MAINTENANCE_GROUP, MAINTENANCE_TASKS } from "@/lib/onboarding/tasks";
import { maybeArchiveOnCheckinsComplete } from "@/lib/data/onboarding";

const VALID_STATUS = ["TODO", "DONE", "NA"] as const;
const CHECKIN_KEYS = new Set(MAINTENANCE_TASKS.map((t) => t.key));

// Mark one check-in (e.g. 30-day) for many post-onboard employees at once. Scoped
// to MAINTENANCE tasks so this can never touch the main onboarding checklist, and
// it runs the same auto-archive check per person as the single toggle.
export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { hireIds?: unknown; key?: unknown; status?: unknown };
    const hireIds = Array.isArray(body.hireIds) ? body.hireIds.filter((x): x is string => typeof x === "string") : [];
    const key = typeof body.key === "string" ? body.key : "";
    const status = typeof body.status === "string" && VALID_STATUS.includes(body.status as (typeof VALID_STATUS)[number]) ? body.status : "DONE";

    if (hireIds.length === 0) {
      return NextResponse.json({ message: "Select at least one person." }, { status: 400 });
    }
    if (!CHECKIN_KEYS.has(key)) {
      return NextResponse.json({ message: "Unknown check-in." }, { status: 400 });
    }

    const result = await prisma.onboardingTask.updateMany({
      where: { newHireId: { in: hireIds }, key, group: MAINTENANCE_GROUP },
      data: { status, completedAt: status === "DONE" ? new Date() : null }
    });

    // A completed check-in may finish someone's set — archive whoever is done.
    const archivedIds: string[] = [];
    if (status === "DONE") {
      for (const hireId of hireIds) {
        if (await maybeArchiveOnCheckinsComplete(hireId)) archivedIds.push(hireId);
      }
    }

    return NextResponse.json({ ok: true, count: result.count, archivedIds });
  } catch (error) {
    console.error("Bulk check-in update error:", error);
    return NextResponse.json({ message: "Unable to update check-ins." }, { status: 500 });
  }
}
