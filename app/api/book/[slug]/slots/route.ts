import { NextResponse } from "next/server";
import { getAvailableSlots } from "@/lib/data/booking";

/** Public: available slots for a host + booking type. No auth (outside middleware's protected list). */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(request.url);
  const typeId = url.searchParams.get("typeId");
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  const from = fromParam ? new Date(fromParam) : null;
  const to = toParam ? new Date(toParam) : null;

  const result = await getAvailableSlots(slug, typeId, from, to);
  if (!result) {
    return NextResponse.json({ message: "Scheduling link not found." }, { status: 404 });
  }

  return NextResponse.json({
    timezone: result.host.timezone,
    type: result.type,
    days: result.days
  });
}
