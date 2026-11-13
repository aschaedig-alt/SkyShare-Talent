import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { RATED_DAY_MARKS } from "@/lib/onboarding/checkin-rating";
import { checkinRatingView, saveCheckinRating } from "@/lib/onboarding/save-checkin-rating";

// The check-in ratings (90-day, 6-month, 12-month) HR enters from the hiring manager (Quality of Hire,
// Dec 10 2026). Same permission as ticking a check-in done (onboarding-tasks/[id]).
// See lib/onboarding/checkin-rating.ts. The save and the tick live in
// lib/onboarding/save-checkin-rating.ts, shared with the manager's no-login link.
//
//   GET  ?ids=a,b,c                       the saved ratings (90-day, 6-month, 12-month) for those hires
//   POST { newHireId, dayMark (90|180|365), answers: { scores, progress, wouldHireAgain }, managerName, notes }   save (one per hire);
//        also ticks that check-in done, and says so: { rating, checkinDone, archived }

const MAX_IDS = 500;

export async function GET(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, MAX_IDS);
  if (!ids.length) return NextResponse.json({ ratings: [] });
  const rows = await prisma.hireCheckinRating.findMany({ where: { newHireId: { in: ids }, dayMark: { in: RATED_DAY_MARKS } } });
  return NextResponse.json({ ratings: rows.map(checkinRatingView) });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const body = (await request.json().catch(() => ({}))) as { newHireId?: unknown; dayMark?: unknown; answers?: unknown; managerName?: unknown; notes?: unknown };
  const result = await saveCheckinRating({
    newHireId: typeof body.newHireId === "string" ? body.newHireId.trim() : "",
    // 90 when not given: the only check-in that had a rating before the 6- and 12-month ones.
    dayMark: typeof body.dayMark === "number" ? body.dayMark : 90,
    answers: body.answers,
    managerName: body.managerName,
    notes: body.notes,
    enteredBy: auth.user.email ?? auth.user.name ?? null
  });
  if (!result.ok) {
    const failed = result as { status: number; message: string };
    return NextResponse.json({ message: failed.message }, { status: failed.status });
  }
  return NextResponse.json(result);
}
