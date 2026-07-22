import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { renameBuiltinTask, setBuiltinHidden, renameGroup } from "@/lib/data/onboarding-grid-config";

// PATCH /api/onboarding-grid — rename or hide a built-in checklist task, or rename
// a group heading, from the Grid's Manage mode. Custom (added) tasks go through
// /api/onboarding-milestones.
export async function PATCH(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    key?: unknown;
    label?: unknown;
    hidden?: unknown;
    groupKey?: unknown;
  };

  // Renaming a GROUP heading rather than a task.
  if (typeof body.groupKey === "string" && body.groupKey) {
    if (typeof body.label !== "string") {
      return NextResponse.json({ message: "A group name is required." }, { status: 400 });
    }
    try {
      await renameGroup(body.groupKey, body.label);
      return NextResponse.json({ ok: true });
    } catch (error) {
      return NextResponse.json(
        { message: error instanceof Error ? error.message : "Unable to rename the group." },
        { status: 400 }
      );
    }
  }

  if (typeof body.key !== "string" || !body.key) {
    return NextResponse.json({ message: "A task key is required." }, { status: 400 });
  }

  try {
    if (typeof body.label === "string") {
      await renameBuiltinTask(body.key, body.label);
    }
    if (typeof body.hidden === "boolean") {
      await setBuiltinHidden(body.key, body.hidden);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update the task.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
