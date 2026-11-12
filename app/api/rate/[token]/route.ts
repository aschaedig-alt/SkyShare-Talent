import { NextResponse } from "next/server";
import { completeRatingLink, lookupRatingLink } from "@/lib/onboarding/checkin-rating-request";
import { checkCheckinRatingInput, saveCheckinRating } from "@/lib/onboarding/save-checkin-rating";

// PUBLIC: the hiring manager's no-login 90-day rating submit (feedback cmwcq16o7).
// Not behind the auth wall by design - see middleware.ts, which does not list
// /api/rate. The token in the path IS the authorisation, and it opens exactly one
// employee's form: this route saves one rating for the hire the token names and
// returns nothing about any other rating, not even that one's saved values.
//
//   POST { ratings, wouldHireAgain, managerName, notes }

const CLOSED: Record<string, string> = {
  COMPLETED: "This rating has already been submitted. Thank you!",
  EXPIRED: "This link has expired. Ask HR to send a new one.",
  CANCELLED: "This link is no longer active.",
  RATED_IN_APP: "HR has already recorded this rating, so there is nothing more to do. Thank you!"
};

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await lookupRatingLink(token);
  if (!link.found) return NextResponse.json({ message: "This link isn't valid." }, { status: 404 });
  const found = link as Extract<typeof link, { found: true }>;
  if (found.state !== "PENDING") return NextResponse.json({ message: CLOSED[found.state] ?? "This link is no longer active." }, { status: 410 });

  const body = (await request.json().catch(() => ({}))) as { ratings?: unknown; wouldHireAgain?: unknown; managerName?: unknown; notes?: unknown };
  // Notes arrive as plain text from a textarea; anything that looks like markup is
  // stored as typed text, never as rich HTML, since nobody signed in wrote it.
  const notes = typeof body.notes === "string" ? body.notes.replace(/[<>]/g, "").slice(0, 8000) : null;
  const check = checkCheckinRatingInput({ ratings: body.ratings, wouldHireAgain: body.wouldHireAgain, notes });
  if (!check.ok) return NextResponse.json({ message: (check as { message: string }).message }, { status: 400 });

  const typedName = typeof body.managerName === "string" ? body.managerName.replace(/\s+/g, " ").trim().slice(0, 80) || null : null;
  const managerName = typedName ?? found.managerName;
  const result = await saveCheckinRating({
    newHireId: found.hireId,
    ratings: body.ratings,
    wouldHireAgain: body.wouldHireAgain,
    managerName,
    notes,
    enteredBy: `Rating link${managerName ? ` (${managerName})` : ""}`
  });
  if (!result.ok) return NextResponse.json({ message: "Could not save the rating. Please try again." }, { status: 500 });
  await completeRatingLink(found.hireId, token, managerName);
  return NextResponse.json({ ok: true });
}
