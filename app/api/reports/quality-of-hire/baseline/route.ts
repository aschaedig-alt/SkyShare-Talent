import { NextResponse } from "next/server";
import { requireApiUser, authFailureResponse } from "@/lib/auth/route-auth";
import { getQualityOfHire } from "@/lib/quality-of-hire/report";
import { computeBaseline } from "@/lib/quality-of-hire/baseline";
import { freezeBaseline, unfreezeBaseline } from "@/lib/quality-of-hire/baseline-store";

// Reports > Hiring > Hire quality baseline: freeze the numbers as they stand, or go
// back to live numbers. Admin only, like everything built on Hire quality's data.
// The numbers are worked out HERE, on the server, at the moment of freezing - never
// taken from the browser - so a frozen baseline is always what the rules gave.
//
//   POST { action: "freeze" }     keep today's numbers as the baseline
//   POST { action: "unfreeze" }   back to live numbers (the frozen copy is kept)

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return authFailureResponse(auth);
  if (auth.user.role !== "ADMIN") return NextResponse.json({ message: "Only an admin can freeze the baseline." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { action?: unknown };
  const by = auth.user.email ?? auth.user.name ?? null;

  if (body.action === "freeze") {
    const frozen = await freezeBaseline(computeBaseline(await getQualityOfHire()), by);
    if (!frozen) return NextResponse.json({ message: "A baseline is already frozen. Unfreeze it first." }, { status: 409 });
    return NextResponse.json({ ok: true, frozenAt: frozen.frozenAt });
  }
  if (body.action === "unfreeze") {
    const done = await unfreezeBaseline(by);
    if (!done) return NextResponse.json({ message: "Nothing is frozen." }, { status: 409 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ message: "Freeze or unfreeze?" }, { status: 400 });
}
