import { prisma } from "@/lib/prisma";
import { frontFetch } from "@/lib/front/client";
import { getMessages, type FrontMessage } from "@/lib/front/inbound";
import { looksLikeEventEmail } from "@/lib/events/parse-event-email";
import { extractEventFromEmail, type ExtractedEvent } from "@/lib/events/event-email-ai";

/**
 * Sweep the mailbox for event invitations we have not dealt with yet.
 *
 * Read-only. It proposes; the user disposes. Nothing here writes an Event —
 * importing is a separate, explicit action (see importEventFromLead).
 *
 * Three filters, cheapest first, because the expensive one should see as few
 * emails as possible:
 *
 *   1. Front search on tight phrases. Verified against the real mailbox: the
 *      `inbox:` modifier is NOT supported by Front's search DSL (400), and
 *      `after:<unix>` is. Search reads the BODY, not just the subject, so a
 *      loose term is useless — "conference" alone returns every New Hire
 *      Orientation email in the account, because they mention a conference line.
 *   2. looksLikeEventEmail: an event word AND a readable date, on the real body.
 *   3. The model's own isEventInvitation. This is what rejects the near-misses
 *      that survive 1 and 2 — the PayPal receipt and the invoice reminder for a
 *      career-fair booth both match the phrase and carry dates, but neither is
 *      an invitation to anything.
 *
 * Already-imported threads (Event.sourceConversationId) and ones you have said
 * no to (EventLeadSkip) are excluded before any of that, so a repeat scan is
 * quiet rather than a re-run of the same list.
 */

// Deliberately specific. Each of these is a phrase an organizer actually writes,
// and a term loose enough to catch a maybe is a term that buries the real ones.
const SEARCH_PHRASES = [
  "career fair",
  "job fair",
  "hiring event",
  "career expo",
  "career day",
  "recruiting event",
  "aviation expo",
  "air show",
  "airshow",
  "exhibitor",
  "static display",
];

/** Ceiling on model calls per scan, so one sweep cannot run away. */
const MAX_EXTRACTIONS = 25;

export type PossibleDuplicate = {
  id: string;
  name: string;
  startsAt: string;
  status: string;
  /** Plain-English reason, shown to the user rather than a score. */
  matchedOn: string;
};

export type EventLead = {
  conversationId: string;
  /** Deep link back into Front, so the whole thread is one click away. */
  frontUrl: string;
  subject: string;
  fromName: string | null;
  fromEmail: string | null;
  receivedAt: string | null;
  draft: ExtractedEvent;
  /**
   * An event already on the calendar that looks like this same one.
   *
   * The conversation id catches a re-import of the same EMAIL, but not an event
   * somebody added by hand — and that is the common case, because the natural
   * thing to do with an invitation is type it in. The first real scan proved it:
   * it offered "Girls in Aviation Day 2026" when a confirmed "Girls in Aviation
   * day" for the same date was already on the calendar, entered manually and so
   * carrying no source link.
   *
   * Surfaced, never acted on. It is a warning next to the Review button, not a
   * filter — two genuinely different events can share a city and a weekend, and
   * silently hiding the second one would be the worse failure.
   */
  possibleDuplicate: PossibleDuplicate | null;
};

export type ScanResult = {
  leads: EventLead[];
  /** Threads matched by search, before filtering — the denominator. */
  scanned: number;
  /** Excluded because an event was already created from them. */
  alreadyImported: number;
  /** Excluded because they are on the skip list. */
  skipped: number;
  /**
   * Real invitations whose date has already been and gone. Counted rather than
   * silently dropped, so "nothing found" can be told apart from "everything
   * found has already happened".
   */
  pastEvents: number;
  /**
   * True when the extraction ceiling was hit and some candidates were not read.
   * Surfaced rather than swallowed: a silently truncated scan reads as "there is
   * nothing else", which is the one thing it must never imply.
   */
  truncated: boolean;
  /** Set when the model is unavailable — results are pattern-matched only. */
  degraded: boolean;
};

type SearchHit = {
  id: string;
  subject?: string;
  created_at?: number;
};

/** Front's own web URL for a thread. */
function frontUrl(conversationId: string) {
  return `https://app.frontapp.com/open/${conversationId}`;
}

/**
 * Words worth matching a name on — the ones that identify the event, not the
 * ones every event name contains. Without this stoplist "Aviation Career Fair"
 * matches every other aviation career fair in the calendar.
 */
const NAME_STOPWORDS = new Set([
  "the", "and", "for", "annual", "aviation", "career", "fair", "job", "day",
  "days", "event", "expo", "conference", "show", "airshow", "university",
  "college", "school", "2025", "2026", "2027", "th", "st", "nd", "rd"
]);

function significantWords(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !NAME_STOPWORDS.has(w))
  );
}

/**
 * Does an already-saved event look like this draft?
 *
 * Date does the heavy lifting — an event is anchored to its day, and organizers
 * do not move them. A ±2 day window absorbs a multi-day event recorded as its
 * opening day. Date alone is not enough (two unrelated fairs can share a
 * Thursday), so it must be corroborated by the city or by a distinctive word in
 * the name.
 */
function findDuplicate(
  draft: ExtractedEvent,
  existing: Array<{ id: string; name: string; startsAt: Date; endsAt: Date | null; city: string | null; status: string }>
): PossibleDuplicate | null {
  if (!draft.startsAt) return null;
  const draftStart = new Date(draft.startsAt).getTime();
  const draftWords = significantWords(draft.name ?? "");
  const draftCity = draft.city?.trim().toLowerCase() ?? null;
  const TWO_DAYS = 2 * 86400 * 1000;

  for (const event of existing) {
    const nearDate =
      Math.abs(event.startsAt.getTime() - draftStart) <= TWO_DAYS ||
      (event.endsAt !== null && Math.abs(event.endsAt.getTime() - draftStart) <= TWO_DAYS);
    if (!nearDate) continue;

    const sameCity =
      draftCity !== null && event.city !== null && event.city.trim().toLowerCase() === draftCity;
    const shared = [...significantWords(event.name)].filter((w) => draftWords.has(w));

    if (sameCity || shared.length > 0) {
      const reason = sameCity
        ? shared.length > 0
          ? `the same date and city, and "${shared[0]}" in the name`
          : "the same date and city"
        : `the same date and "${shared[0]}" in the name`;
      return {
        id: event.id,
        name: event.name,
        startsAt: event.startsAt.toISOString(),
        status: event.status,
        matchedOn: reason,
      };
    }
  }
  return null;
}

function senderOf(message: FrontMessage): { name: string | null; email: string | null } {
  const from = message.recipients?.find((r) => r.role === "from")?.handle;
  const email = message.author?.email ?? from ?? null;
  return { name: null, email: email && email.includes("@") ? email : null };
}

/**
 * Conversation ids matching any search phrase, de-duplicated.
 *
 * A failing phrase is logged and skipped rather than thrown: one bad query must
 * not cost the whole sweep the other ten phrases' worth of results.
 */
async function searchConversations(sinceUnix: number): Promise<Map<string, SearchHit>> {
  const found = new Map<string, SearchHit>();

  for (const phrase of SEARCH_PHRASES) {
    const query = `"${phrase}" after:${sinceUnix}`;
    try {
      const page = await frontFetch<{ _results?: SearchHit[] }>(
        `/conversations/search/${encodeURIComponent(query)}`
      );
      for (const hit of page._results ?? []) {
        if (hit?.id && !found.has(hit.id)) found.set(hit.id, hit);
      }
    } catch (error) {
      console.error(`Front event search failed for "${phrase}":`, error);
    }
  }

  return found;
}

/**
 * @param days how far back to look. Defaults to a year: these invitations arrive
 *   months ahead of the event, and a 30-day window would miss most of a season.
 */
export async function scanFrontForEvents({ days = 365 } = {}): Promise<ScanResult> {
  const sinceUnix = Math.floor(Date.now() / 1000) - days * 86400;
  const hits = await searchConversations(sinceUnix);

  const [imported, skippedRows, existingEvents] = await Promise.all([
    prisma.event.findMany({
      where: { sourceConversationId: { in: [...hits.keys()] } },
      select: { sourceConversationId: true },
    }),
    prisma.eventLeadSkip.findMany({
      where: { conversationId: { in: [...hits.keys()] } },
      select: { conversationId: true },
    }),
    // Every non-canceled event, for the looks-like-a-duplicate check. Small
    // table, and loading it once beats a query per candidate.
    prisma.event.findMany({
      where: { status: { not: "CANCELED" } },
      select: { id: true, name: true, startsAt: true, endsAt: true, city: true, status: true },
    }),
  ]);

  const importedIds = new Set(imported.map((e) => e.sourceConversationId));
  const skippedIds = new Set(skippedRows.map((s) => s.conversationId));

  const candidates = [...hits.values()].filter(
    (h) => !importedIds.has(h.id) && !skippedIds.has(h.id)
  );
  // Newest first: the next fair matters more than one from ten months ago.
  candidates.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));

  const leads: EventLead[] = [];
  let extractions = 0;
  let truncated = false;
  let degraded = false;
  let pastEvents = 0;

  // Midnight today: an event that finished last spring is not a decision to make.
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);

  for (const hit of candidates) {
    if (extractions >= MAX_EXTRACTIONS) {
      truncated = true;
      break;
    }

    let messages: FrontMessage[];
    try {
      messages = await getMessages(hit.id);
    } catch (error) {
      console.error(`Could not read Front thread ${hit.id}:`, error);
      continue;
    }

    // The invitation is the first thing THEY sent us. A thread that opens with
    // our own outbound mail is us contacting them, not an invitation in.
    const inbound = messages.find((m) => m.is_inbound);
    if (!inbound) continue;

    const subject = inbound.subject ?? hit.subject ?? "";
    const body = inbound.text ?? "";
    if (!looksLikeEventEmail(subject, body)) continue;

    extractions += 1;
    const draft = await extractEventFromEmail(body, subject);
    if (draft.source === "pattern") degraded = true;
    // The model's verdict is what separates an invitation from a receipt for one.
    if (!draft.isEventInvitation || !draft.startsAt) continue;

    if (new Date(draft.endsAt ?? draft.startsAt) < cutoff) {
      pastEvents += 1;
      continue;
    }

    const sender = senderOf(inbound);
    leads.push({
      conversationId: hit.id,
      frontUrl: frontUrl(hit.id),
      subject,
      fromName: draft.contactName ?? sender.name,
      fromEmail: draft.contactEmail ?? sender.email,
      receivedAt: hit.created_at ? new Date(hit.created_at * 1000).toISOString() : null,
      draft,
      possibleDuplicate: findDuplicate(draft, existingEvents),
    });
  }

  // Soonest event first — that is the one with a decision deadline.
  leads.sort((a, b) => (a.draft.startsAt ?? "").localeCompare(b.draft.startsAt ?? ""));

  return {
    leads,
    scanned: hits.size,
    alreadyImported: importedIds.size,
    skipped: skippedIds.size,
    pastEvents,
    truncated,
    degraded,
  };
}

/**
 * Read ONE thread as an event draft, for "I'm sending you this email" rather
 * than a sweep. Accepts a Front conversation id or a Front URL containing one.
 */
export async function readEventFromConversation(input: string): Promise<{
  lead: EventLead | null;
  message: string | null;
}> {
  const match = input.match(/\b(cnv_[a-z0-9]+)\b/i);
  const conversationId = match ? match[1] : null;
  if (!conversationId) {
    return { lead: null, message: "That does not look like a Front conversation link or id." };
  }

  const existing = await prisma.event.findFirst({
    where: { sourceConversationId: conversationId },
    select: { id: true, name: true },
  });
  if (existing) {
    return { lead: null, message: `That email is already on the calendar as "${existing.name}".` };
  }

  let messages: FrontMessage[];
  try {
    messages = await getMessages(conversationId);
  } catch (error) {
    console.error(`Could not read Front thread ${conversationId}:`, error);
    return { lead: null, message: "Could not read that thread from Front." };
  }

  const inbound = messages.find((m) => m.is_inbound) ?? messages[0];
  if (!inbound) return { lead: null, message: "That thread has no messages." };

  const subject = inbound.subject ?? "";
  const body = inbound.text ?? "";
  const draft = await extractEventFromEmail(body, subject);
  const sender = senderOf(inbound);

  return {
    lead: {
      conversationId,
      frontUrl: frontUrl(conversationId),
      subject,
      fromName: draft.contactName ?? sender.name,
      fromEmail: draft.contactEmail ?? sender.email,
      receivedAt: typeof inbound.created_at === "number"
        ? new Date(inbound.created_at * 1000).toISOString()
        : null,
      draft,
      possibleDuplicate: findDuplicate(
        draft,
        await prisma.event.findMany({
          where: { status: { not: "CANCELED" } },
          select: { id: true, name: true, startsAt: true, endsAt: true, city: true, status: true },
        })
      ),
    },
    message: null,
  };
}
