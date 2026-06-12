import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { addCustomMilestone, removeCustomMilestone, getMilestoneCatalog } from "@/lib/data/onboarding-milestones";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ milestones: await getMilestoneCatalog() });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as { label?: string };
    const milestones = await addCustomMilestone(String(body?.label ?? ""));
    return NextResponse.json({ ok: true, milestones });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to add milestone." }, { status: 400 });
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
    const milestones = await removeCustomMilestone(key);
    return NextResponse.json({ ok: true, milestones });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to remove milestone." }, { status: 400 });
  }
}
