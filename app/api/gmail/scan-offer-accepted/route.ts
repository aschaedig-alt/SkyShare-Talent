import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { scanGmailForOfferAcceptances, HARD_MAX_MESSAGES } from "@/lib/paycom/gmail-scan";

/**
 * Manual/on-demand sweep of Paycom's "Offer Accepted" notices in Gmail.
 *
 * The sibling of /api/front/scan-paycom, for the one notice that never reaches
 * Front. Same safety posture: DRY RUN unless ?apply=1.
 *
 * Query params: apply=1 to write · days=N to reach further back (default 30) ·
 * limit=N messages (max 200) · mailbox=<address> to read a different mailbox.
 *
 * A 200 with a `blocker` is the normal answer when nobody has granted Gmail
 * scope yet — deliberately not an error status, because the caller wants to show
 * the sentence rather than treat it as a failure.
 */

export async function POST(request: Request) {
  const url = new URL(request.url);
  const apply = url.searchParams.get("apply") === "1";

  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const days = Number(url.searchParams.get("days"));
  const limit = Number(url.searchParams.get("limit"));

  try {
    const report = await scanGmailForOfferAcceptances({
      apply,
      mailbox: url.searchParams.get("mailbox")?.trim() || undefined,
      windowDays: Number.isFinite(days) && days > 0 ? days : undefined,
      maxMessages: Number.isFinite(limit) && limit > 0 ? Math.min(limit, HARD_MAX_MESSAGES) : undefined
    });

    return NextResponse.json({
      ok: true,
      mode: apply ? "APPLIED" : "DRY RUN (pass ?apply=1 to write)",
      ...report
    });
  } catch (error) {
    console.error("Gmail offer-accepted scan error:", error);
    return NextResponse.json(
      {
        message: "Could not read the mailbox.",
        detail: error instanceof Error ? error.message : String(error)
      },
      { status: 502 }
    );
  }
}
