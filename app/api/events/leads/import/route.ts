import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { importEventFromLead, type EventDraftInput } from "@/lib/data/events";

// The only write in the email-to-event path. Everything before it is a
// suggestion; this is the "yes, add it" the user clicks. The event is created
// PENDING — see importEventFromLead.

export const dynamic = "force-dynamic";

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function POST(request: Request) {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const raw = (body.draft ?? {}) as Record<string, unknown>;

    // The draft is rebuilt field by field from what the user actually saw and
    // edited in the review form, rather than trusting a blob echoed back.
    const draft: EventDraftInput = {
      name: str(raw.name),
      type: typeof raw.type === "string" ? (raw.type as EventDraftInput["type"]) : "CAREER_FAIR",
      startsAt: str(raw.startsAt),
      endsAt: str(raw.endsAt),
      venue: str(raw.venue),
      city: str(raw.city),
      state: str(raw.state),
      website: str(raw.website),
      contactName: str(raw.contactName),
      contactEmail: str(raw.contactEmail),
      contactPhone: str(raw.contactPhone),
      shipToAddress: str(raw.shipToAddress),
      notes: str(raw.notes),
      aircraftMentioned: raw.aircraftMentioned === true
    };

    if (!draft.startsAt) {
      return NextResponse.json({ message: "Pick a start date for the event." }, { status: 400 });
    }

    const sourceRaw = (body.source ?? null) as Record<string, unknown> | null;
    const conversationId = sourceRaw ? str(sourceRaw.conversationId) : null;
    const source = conversationId
      ? {
          conversationId,
          frontUrl: str(sourceRaw?.frontUrl) ?? `https://app.frontapp.com/open/${conversationId}`,
          subject: str(sourceRaw?.subject) ?? ""
        }
      : null;

    const { id, alreadyExisted } = await importEventFromLead(draft, source);
    return NextResponse.json({ ok: true, id, alreadyExisted });
  } catch (error) {
    console.error("Event import error:", error);
    const message = error instanceof Error ? error.message : "Unable to add that event.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
