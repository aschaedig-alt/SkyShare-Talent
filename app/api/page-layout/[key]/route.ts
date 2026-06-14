import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { savePageLayout } from "@/lib/data/page-layout";

export async function PUT(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const auth = await requireApiPermission("settings:admin");

  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { key } = await params;

  try {
    const body = (await request.json()) as { layout?: unknown; widgets?: unknown };
    if (!Array.isArray(body.layout)) {
      return NextResponse.json({ message: "A layout array is required." }, { status: 400 });
    }
    const saved = await savePageLayout(key, { layout: body.layout, widgets: body.widgets });
    return NextResponse.json(saved);
  } catch {
    return NextResponse.json({ message: "Unable to save layout." }, { status: 500 });
  }
}
