import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { createOrientationSession } from "@/lib/data/orientation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as { date?: string; location?: string; address?: string; meetLink?: string };
    if (!body?.date) {
      return NextResponse.json({ message: "A date is required." }, { status: 400 });
    }
    const date = new Date(body.date);
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ message: "Invalid date." }, { status: 400 });
    }
    const session = await createOrientationSession({
      date,
      location: body.location?.trim() || undefined,
      address: body.address?.trim() || null,
      meetLink: body.meetLink?.trim() || null
    });
    return NextResponse.json({ ok: true, id: session.id });
  } catch (error) {
    console.error("Create orientation session error:", error);
    return NextResponse.json({ message: "Unable to create session." }, { status: 500 });
  }
}
