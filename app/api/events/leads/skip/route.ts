import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { skipEventLead, unskipEventLead } from "@/lib/data/events";

// The skip list: "no thanks" for an email the scan offered. A row here is a
// record of a decision, not a deletion — DELETE puts the email back in the
// next scan, so nothing is ever lost by passing on it.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";
    if (!conversationId) {
      return NextResponse.json({ message: "Which email?" }, { status: 400 });
    }
    const subject = typeof body.subject === "string" ? body.subject.slice(0, 300) : null;
    await skipEventLead(conversationId, subject, auth.user.email);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Skip event lead error:", error);
    return NextResponse.json({ message: "Unable to skip that email." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";
    if (!conversationId) {
      return NextResponse.json({ message: "Which email?" }, { status: 400 });
    }
    await unskipEventLead(conversationId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Unskip event lead error:", error);
    return NextResponse.json({ message: "Unable to restore that email." }, { status: 500 });
  }
}
