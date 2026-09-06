import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { logActivity } from "@/lib/activity/logger";
import { getStageList, saveStageList } from "@/lib/data/candidate-stages";

export const dynamic = "force-dynamic";

/**
 * The pipeline stage vocabulary.
 *
 * PUT replaces the whole list rather than patching one entry, because order is
 * part of the meaning here — the list is the pipeline, read top to bottom — and
 * a per-entry API would need a separate reorder call anyway.
 *
 * This only changes what the pickers OFFER. No candidate record is touched, so
 * retiring a stage somebody is on leaves them on it (shown under "Current" in
 * the picker) rather than rewriting their history.
 */
export async function GET() {
  const auth = await requireApiPermission("candidates:read");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ stages: await getStageList() });
}

export async function PUT(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { stages?: unknown };
  if (!Array.isArray(body.stages)) {
    return NextResponse.json({ message: "stages must be a list." }, { status: 400 });
  }
  if (body.stages.length === 0) {
    return NextResponse.json(
      { message: "Keep at least one stage — an empty list leaves the picker with nothing to offer." },
      { status: 400 }
    );
  }
  if (body.stages.length > 40) {
    return NextResponse.json({ message: "That is too many stages to be useful." }, { status: 400 });
  }

  const before = await getStageList();
  const stages = await saveStageList(body.stages);

  await logActivity({
    userId: auth.user?.id,
    userEmail: auth.user?.email || undefined,
    activityType: "CANDIDATE_EDITED",
    // The OLD list goes in the description, because this overwrites a vocabulary
    // and there is otherwise no way back to what it used to be.
    description:
      `Changed the candidate stage list from [${before.map((s) => s.value).join(", ")}] ` +
      `to [${stages.map((s) => s.value).join(", ")}]`,
    entityType: "Workspace",
    entityId: "candidate-stages"
  });

  return NextResponse.json({ ok: true, stages });
}
