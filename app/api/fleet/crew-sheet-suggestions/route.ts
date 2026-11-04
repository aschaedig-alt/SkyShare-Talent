import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { getScanState, recordDecision, runScan } from "@/lib/fleet/sheet-scan/store.server";

export const dynamic = "force-dynamic";

/**
 * The crew chart's sheet suggestions (feedback cmw13vxfx). Admin-only, the same
 * gate as editing the chart itself (settings:admin).
 *   GET                          -> the stored scan and its decisions
 *   POST { action: "scan" }      -> run the scan now ("Scan now")
 *   POST { action: "decide", id, decision: "kept" | "applied" | "modified" }
 * A decision is only a record; applying a change goes through the chart's own
 * roster save, so it is exactly like an edit made by hand.
 */
const DECISIONS = ["kept", "applied", "modified"] as const;

export async function GET() {
  const auth = await requireApiPermission("settings:admin");
  if (!auth.ok) return NextResponse.json({ message: "You do not have permission to see the crew chart suggestions." }, { status: 401 });
  return NextResponse.json(await getScanState());
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("settings:admin");
  if (!auth.ok) return NextResponse.json({ message: "You do not have permission to act on the crew chart suggestions." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { action?: string; id?: string; decision?: string };
  if (body.action === "scan") return NextResponse.json(await runScan());
  if (body.action === "decide") {
    if (!body.id || !DECISIONS.includes(body.decision as (typeof DECISIONS)[number])) {
      return NextResponse.json({ message: "A decision needs an id and one of kept, applied, modified." }, { status: 400 });
    }
    const by = (auth.user as { email?: string | null } | undefined)?.email ?? null;
    return NextResponse.json(await recordDecision(body.id, body.decision as (typeof DECISIONS)[number], by));
  }
  return NextResponse.json({ message: "Unknown action." }, { status: 400 });
}
