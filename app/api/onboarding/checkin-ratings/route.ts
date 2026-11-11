import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { CHECKIN_RATING_DAY, cleanRatings, type CheckinRatingView } from "@/lib/onboarding/checkin-rating";

// The 90-day check-in rating HR enters from the hiring manager (Quality of Hire,
// Dec 10 2026). Same permission as ticking a check-in done (onboarding-tasks/[id]).
// See lib/onboarding/checkin-rating.ts.
//
//   GET  ?ids=a,b,c                       the saved ratings for those hires
//   POST { newHireId, ratings, wouldHireAgain, managerName, notes }   save (one per hire)

const MAX_IDS = 500;
const tidy = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) || null : null);

function view(r: { newHireId: string; dayMark: number; ratingsJson: string; wouldHireAgain: boolean | null; managerName: string | null; notes: string | null; enteredBy: string | null; updatedAt: Date }): CheckinRatingView {
  let ratings = {};
  try {
    ratings = cleanRatings(JSON.parse(r.ratingsJson));
  } catch {
    ratings = {};
  }
  return { newHireId: r.newHireId, dayMark: r.dayMark, ratings, wouldHireAgain: r.wouldHireAgain, managerName: r.managerName, notes: r.notes, enteredBy: r.enteredBy, updatedAt: r.updatedAt.toISOString() };
}

export async function GET(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, MAX_IDS);
  if (!ids.length) return NextResponse.json({ ratings: [] });
  const rows = await prisma.hireCheckinRating.findMany({ where: { newHireId: { in: ids }, dayMark: CHECKIN_RATING_DAY } });
  return NextResponse.json({ ratings: rows.map(view) });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const body = (await request.json().catch(() => ({}))) as { newHireId?: unknown; ratings?: unknown; wouldHireAgain?: unknown; managerName?: unknown; notes?: unknown };
  const newHireId = typeof body.newHireId === "string" ? body.newHireId.trim() : "";
  if (!newHireId) return NextResponse.json({ message: "Which person?" }, { status: 400 });
  const ratings = cleanRatings(body.ratings);
  const wouldHireAgain = typeof body.wouldHireAgain === "boolean" ? body.wouldHireAgain : null;
  if (!Object.keys(ratings).length && wouldHireAgain === null) {
    return NextResponse.json({ message: "Rate at least one value, or answer \"would you hire again?\"" }, { status: 400 });
  }
  const hire = await prisma.newHire.findUnique({ where: { id: newHireId }, select: { id: true } });
  if (!hire) return NextResponse.json({ message: "Person not found." }, { status: 404 });

  const data = {
    ratingsJson: JSON.stringify(ratings),
    wouldHireAgain,
    managerName: tidy(body.managerName, 80),
    notes: tidy(body.notes, 2000),
    enteredBy: auth.user.email ?? auth.user.name ?? null
  };
  const saved = await prisma.hireCheckinRating.upsert({
    where: { newHireId_dayMark: { newHireId, dayMark: CHECKIN_RATING_DAY } },
    create: { newHireId, dayMark: CHECKIN_RATING_DAY, ...data },
    update: data
  });
  return NextResponse.json({ ok: true, rating: view(saved) });
}
