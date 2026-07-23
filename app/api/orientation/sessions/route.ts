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
    const body = (await request.json()) as { date?: string; endsAt?: string | null; location?: string; address?: string; meetLink?: string; attendeeHireIds?: string[] };
    if (!body?.date) {
      return NextResponse.json({ message: "A date is required." }, { status: 400 });
    }
    const date = new Date(body.date);
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ message: "Invalid date." }, { status: 400 });
    }
    // An end time is optional, but if one is given it has to be after the start —
    // otherwise a typo silently stores a session that ends before it begins.
    let endsAt: Date | null = null;
    if (body.endsAt) {
      const parsed = new Date(body.endsAt);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ message: "Invalid end time." }, { status: 400 });
      }
      if (parsed.getTime() <= date.getTime()) {
        return NextResponse.json({ message: "The end time has to be after the start time." }, { status: 400 });
      }
      endsAt = parsed;
    }
    const session = await createOrientationSession({
      date,
      endsAt,
      location: body.location?.trim() || undefined,
      address: body.address?.trim() || null,
      meetLink: body.meetLink?.trim() || null,
      attendeeHireIds: Array.isArray(body.attendeeHireIds) ? body.attendeeHireIds.filter((x): x is string => typeof x === "string") : undefined
    });
    return NextResponse.json({ ok: true, id: session.id });
  } catch (error) {
    console.error("Create orientation session error:", error);
    return NextResponse.json({ message: "Unable to create session." }, { status: 500 });
  }
}
