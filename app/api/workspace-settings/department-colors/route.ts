import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { getDepartmentColorOverrides, saveDepartmentColorOverrides } from "@/lib/calendar/department-colors.server";

export const dynamic = "force-dynamic";

export async function GET() {
  const overrides = await getDepartmentColorOverrides();
  return NextResponse.json(overrides);
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("settings:admin");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const saved = await saveDepartmentColorOverrides(payload);
    return NextResponse.json(saved);
  } catch {
    return NextResponse.json({ message: "Unable to save department colors." }, { status: 500 });
  }
}
