import { NextResponse } from "next/server";
import { getExecHuntLiveData } from "@/lib/exec-hunt/server";

// PUBLIC - what the projector shows. Totals, per-picture counts and (if the admin
// allows) names with counts. No ids, tokens or times.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getExecHuntLiveData(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Exec hunt live error:", error);
    return NextResponse.json({ message: "Unavailable" }, { status: 500 });
  }
}
