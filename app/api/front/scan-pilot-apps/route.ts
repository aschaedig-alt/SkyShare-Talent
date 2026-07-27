import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { scanPilotApplications, resolveLimit } from "@/lib/pilotapp/scan";

/**
 * Manual/on-demand sweep for completed pilot applications in pilotapp@.
 *
 * SAFE BY DEFAULT: dry run unless ?apply=1 — so this can always be used to see
 * exactly which candidate each notice would be filed against BEFORE anything is
 * downloaded, commented on, or archived. The nightly run lives at
 * /api/cron/pilot-app-scan; both call the same scanPilotApplications().
 *
 * Query params: apply=1 to write · limit=N (max 300) · q=<front search>.
 */

export async function POST(request: Request) {
  const url = new URL(request.url);
  const apply = url.searchParams.get("apply") === "1";

  // Filing a document is a file write as much as a candidate write, so require
  // both permissions rather than the lower of the two.
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const fileAuth = await requireApiPermission("files:write");
  if (!fileAuth.ok) {
    return NextResponse.json({ message: "Unauthorized — filing a document needs files:write." }, { status: 401 });
  }

  if (!process.env.FRONT_API_TOKEN) {
    return NextResponse.json(
      { message: "FRONT_API_TOKEN is not configured — cannot read the inbox." },
      { status: 503 }
    );
  }

  const query = url.searchParams.get("q")?.trim() || undefined;

  try {
    const report = await scanPilotApplications({
      apply,
      query,
      maxConversations: resolveLimit(url.searchParams.get("limit"))
    });

    return NextResponse.json({
      ok: true,
      mode: apply ? "APPLIED" : "DRY RUN (pass ?apply=1 to write)",
      ...report
    });
  } catch (error) {
    console.error("Pilot application scan error:", error);
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
