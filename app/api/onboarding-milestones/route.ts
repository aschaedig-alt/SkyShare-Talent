import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { addMilestone, editMilestone, removeMilestone, reorderMilestones, getMilestoneCatalog } from "@/lib/data/onboarding-milestones";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiPermission("candidates:read");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ milestones: await getMilestoneCatalog() });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as { label?: string };
    const milestones = await addMilestone(String(body?.label ?? ""));
    return NextResponse.json({ ok: true, milestones });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to add milestone." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as { key?: string; label?: string; order?: string[] };
    if (Array.isArray(body?.order)) {
      const milestones = await reorderMilestones(body.order.filter((k): k is string => typeof k === "string"));
      return NextResponse.json({ ok: true, milestones });
    }
    if (!body?.key) {
      return NextResponse.json({ message: "Milestone key is required." }, { status: 400 });
    }
    const milestones = await editMilestone(body.key, String(body?.label ?? ""));
    return NextResponse.json({ ok: true, milestones });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to edit milestone." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key") ?? "";
    if (!key) {
      return NextResponse.json({ message: "Milestone key is required." }, { status: 400 });
    }
    const milestones = await removeMilestone(key);
    return NextResponse.json({ ok: true, milestones });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to remove milestone." }, { status: 400 });
  }
}
