import { NextResponse } from "next/server";
import { completeSignoff, lookupSignoffLink } from "@/lib/quality-of-hire/signoff-requests";
import { cleanSignoffAnswers, missingSignoffAnswers } from "@/lib/quality-of-hire/signoff-questions";

// PUBLIC: a hiring manager's sign-off submit. Not behind the auth wall by design,
// like /api/rate - the token in the path IS the authorization, and it opens exactly
// one request. Returns nothing about anyone's answers.
//
//   POST { answers: SignoffAnswers }

const CLOSED: Record<string, string> = {
  COMPLETED: "Your sign-off has already been received. Thank you!",
  EXPIRED: "This link has expired. Ask HR to send a new one.",
  CANCELLED: "This link is no longer active."
};

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await lookupSignoffLink(token);
  if (!link.found) return NextResponse.json({ message: "This link isn't valid." }, { status: 404 });
  const found = link as Extract<typeof link, { found: true }>;
  if (found.state !== "PENDING") return NextResponse.json({ message: CLOSED[found.state] ?? "This link is no longer active." }, { status: 410 });

  const body = (await request.json().catch(() => ({}))) as { answers?: unknown };
  const answers = cleanSignoffAnswers(body.answers);
  const missing = missingSignoffAnswers(answers);
  if (missing.length) return NextResponse.json({ message: `Still needed: ${missing.join(", ")}.` }, { status: 400 });

  const result = await completeSignoff(token, answers);
  if (!result.ok) return NextResponse.json({ message: (result as { error: string }).error }, { status: 410 });
  return NextResponse.json({ ok: true });
}
