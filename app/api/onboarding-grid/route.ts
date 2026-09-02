import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import {
  renameBuiltinTask,
  setBuiltinHidden,
  renameGroup,
  saveChecklistArrangement
} from "@/lib/data/onboarding-grid-config";
import { setTaskEmail, clearTaskEmail, parseAddressList } from "@/lib/onboarding/task-email-config";

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

/**
 * PUT /api/onboarding-grid — save the whole checklist layout.
 *
 * The client sends the arrangement it is currently showing, in full: the sections
 * top to bottom, and every task with the section it now sits in. Not a delta —
 * what gets stored is exactly what she was looking at when she pressed Save.
 *
 * This also re-stamps group + order on the per-hire task rows (see the comment
 * over saveChecklistArrangement), so it is a live write. It changes only those two
 * columns, creates and deletes nothing, and is undone by dragging back and saving.
 */
export async function PUT(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    groupOrder?: unknown;
    tasks?: unknown;
  };

  const groupOrder = Array.isArray(body.groupOrder)
    ? body.groupOrder.filter((k): k is string => typeof k === "string")
    : [];
  const tasks = Array.isArray(body.tasks)
    ? body.tasks
        .filter((t): t is { key: string; group: string } => {
          const o = t as { key?: unknown; group?: unknown } | null;
          return Boolean(o && typeof o.key === "string" && typeof o.group === "string");
        })
        .map((t) => ({ key: t.key, group: t.group }))
    : [];

  if (groupOrder.length === 0 || tasks.length === 0) {
    return NextResponse.json({ message: "Send the sections and the tasks to reorder." }, { status: 400 });
  }

  try {
    await saveChecklistArrangement({ groupOrder, tasks });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to save the order." },
      { status: 400 }
    );
  }
}

/**
 * POST /api/onboarding-grid — turn a task's email on (with a Front template) or
 * off. Sending no templateId clears it, which is how the toggle turns off.
 */
export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    key?: unknown;
    templateId?: unknown;
    templateName?: unknown;
    audience?: unknown;
    to?: unknown;
    cc?: unknown;
    greeting?: unknown;
  };

  if (typeof body.key !== "string" || !body.key) {
    return NextResponse.json({ message: "A task key is required." }, { status: 400 });
  }

  try {
    if (typeof body.templateId !== "string" || !body.templateId.trim()) {
      await clearTaskEmail(body.key);
      return NextResponse.json({ ok: true, email: null });
    }
    await setTaskEmail(body.key, {
      templateId: body.templateId,
      templateName: typeof body.templateName === "string" ? body.templateName : undefined,
      audience: body.audience === "company" ? "company" : body.audience === "custom" ? "custom" : "personal",
      // Left unvalidated here on purpose: setTaskEmail parses it and REFUSES an
      // empty custom list, so the 400 carries a sentence she can act on rather
      // than this route quietly coercing a typo into "no recipients".
      to: parseAddressList(typeof body.to === "string" ? body.to : Array.isArray(body.to) ? (body.to as string[]) : []),
      cc: parseAddressList(typeof body.cc === "string" ? body.cc : Array.isArray(body.cc) ? (body.cc as string[]) : []),
      greeting: body.greeting !== false
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to save the email settings." },
      { status: 400 }
    );
  }
}
