import { NextResponse } from "next/server";
import { requireApiPermission, authFailureResponse } from "@/lib/auth/route-auth";
import { isHrCaller, scanCheckinReplies } from "@/lib/onboarding/checkin-replies";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// "Check for replies" on the Post-onboard grid: the same sweep the daily cron runs,
// on demand, so HR need not wait for tomorrow morning. ?dry=1 reads and triages
// without filing anything.
export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return authFailureResponse(auth);
  if (!isHrCaller(auth.user)) return NextResponse.json({ message: "Check-in replies are for the HR team only." }, { status: 403 });
  if (!process.env.FRONT_API_TOKEN) return NextResponse.json({ message: "Front is not configured." }, { status: 503 });
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  try {
    const report = await scanCheckinReplies({ apply: !dry });
    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    console.error("checkin reply scan error:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
