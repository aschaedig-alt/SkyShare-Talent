import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { scanPaycomInbox, resolveLimit } from "@/lib/paycom/scan";

/**
 * Manual/on-demand Paycom sweep — the "Check Paycom mail" button, and the way to
 * inspect what a scan would do before letting it loose.
 *
 * SAFE BY DEFAULT: dry run unless ?apply=1. The nightly run lives at
 * /api/cron/paycom-scan; both call the same scanPaycomInbox().
 *
 * Query params: apply=1 to write · limit=N to reach further back (max 300) ·
 * q=<front search> to override the search · debug=1 to see what Front returned.
 */

export async function POST(request: Request) {
  const url = new URL(request.url);
  const apply = url.searchParams.get("apply") === "1";

  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.FRONT_API_TOKEN) {
    return NextResponse.json(
      { message: "FRONT_API_TOKEN is not configured — cannot read the inbox." },
      { status: 503 }
    );
  }

  const query = url.searchParams.get("q")?.trim() || undefined;

  try {
    const report = await scanPaycomInbox({
      apply,
      query,
      maxConversations: resolveLimit(url.searchParams.get("limit")),
      debug: url.searchParams.get("debug") === "1"
    });

    return NextResponse.json({
      ok: true,
      mode: apply ? "APPLIED" : "DRY RUN (pass ?apply=1 to write)",
      ...report
    });
  } catch (error) {
    console.error("Paycom scan error:", error);
    return NextResponse.json(
      {
        message: "Could not read from Front.",
        detail: error instanceof Error ? error.message : String(error),
        hint: `Search query used: ${query ?? "(default)"}. Pass ?q=<front search> to adjust it.`
      },
      { status: 502 }
    );
  }
}
