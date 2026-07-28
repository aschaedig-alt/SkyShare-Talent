import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { scanFrontForEvents, readEventFromConversation } from "@/lib/events/front-event-scan";

// Reading the mailbox for event invitations. Both handlers are READ-ONLY — they
// return suggestions and write nothing. Creating the event is a separate,
// explicit call to /api/events/leads/import.
//
// Guarded by events:write rather than events:read on purpose: this reaches into
// the shared recruiting inbox and spends model tokens, which is not something a
// view-only role should be able to trigger.

export const dynamic = "force-dynamic";
// A sweep reads a dozen threads and runs an extraction on each; the default
// serverless timeout is not enough.
export const maxDuration = 300;

/** GET /api/events/leads — sweep the mailbox for event invitations. */
export async function GET(request: Request) {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  const daysParam = new URL(request.url).searchParams.get("days");
  const parsed = daysParam ? Number.parseInt(daysParam, 10) : NaN;
  const days = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 730) : 365;

  try {
    const result = await scanFrontForEvents({ days });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Event lead scan error:", error);
    return NextResponse.json(
      { message: "Could not read the mailbox. Check the Front connection." },
      { status: 502 }
    );
  }
}

/**
 * POST /api/events/leads — read ONE email as a draft.
 *
 * Two ways in, because that is how these actually arrive: `conversation` takes
 * a Front link or id you forwarded, and `text` takes the body of an email
 * pasted straight in (for mail that never reached the shared inbox).
 */
export async function POST(request: Request) {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const conversation = typeof body.conversation === "string" ? body.conversation.trim() : "";
    const text = typeof body.text === "string" ? body.text : "";
    const subject = typeof body.subject === "string" ? body.subject : "";

    if (conversation) {
      const { lead, message } = await readEventFromConversation(conversation);
      if (!lead) return NextResponse.json({ message }, { status: 400 });
      return NextResponse.json({ lead });
    }

    if (!text.trim()) {
      return NextResponse.json(
        { message: "Paste the email, or give me a Front link to it." },
        { status: 400 }
      );
    }

    // Pasted mail has no thread behind it, so there is no source to record and
    // nothing for a future scan to skip — the draft stands on its own.
    const { extractEventFromEmail } = await import("@/lib/events/event-email-ai");
    const draft = await extractEventFromEmail(text, subject);
    return NextResponse.json({
      lead: {
        conversationId: null,
        frontUrl: null,
        subject: subject || draft.name || "Pasted email",
        fromName: draft.contactName,
        fromEmail: draft.contactEmail,
        receivedAt: null,
        draft
      }
    });
  } catch (error) {
    console.error("Event lead read error:", error);
    return NextResponse.json({ message: "Could not read that email." }, { status: 500 });
  }
}
