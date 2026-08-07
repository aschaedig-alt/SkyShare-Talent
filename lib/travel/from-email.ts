import { prisma } from "@/lib/prisma";
import { getMessages, addComment, addTags, resolveTagIdByNames } from "@/lib/front";
import {
  extractTravelFromEmail,
  auditTravel,
  segmentInstant,
  type LlmTravelEmail
} from "@/lib/extraction/travel-email-llm";
import { matchTraveler, type TravelerMatch } from "@/lib/travel/match-traveler";
import { normalizeTravelPurpose } from "@/lib/travel/constants";

/**
 * Turn a Front email tagged "Travel" into a trip on the traveller's record.
 *
 * SHAPE OF THE DECISION. Three things can go wrong and they are handled
 * differently on purpose:
 *
 *   - we cannot tell WHO it is        -> write nothing, tag the thread for review
 *   - we can tell who, but the read
 *     has a warning on it             -> write it, flagged needsReview
 *   - clean read, confident match     -> write it
 *
 * Nothing is ever silently dropped and nothing is ever silently trusted. Every
 * outcome leaves a comment on the Front thread saying what happened, so the
 * coordinator who tagged it gets an answer in the place they were working.
 *
 * IDEMPOTENT via TravelTrip.sourceConversationId being unique: a webhook retry,
 * a re-tag, or a nightly sweep that sees the thread again all find the existing
 * trip and update it rather than creating a second one.
 */

export type TravelImportOutcome =
  | "imported"
  | "updated"
  | "needs-review"
  | "no-traveler"
  | "no-itinerary"
  | "extraction-failed";

export type TravelImportResult = {
  conversationId: string;
  outcome: TravelImportOutcome;
  tripId: string | null;
  travelerName: string | null;
  hireId: string | null;
  summary: string;
  warnings: string[];
  travel: LlmTravelEmail | null;
  match: TravelerMatch | null;
};

/**
 * Each entry is ONE tag with acceptable spellings; the first that exists wins.
 *
 * Two faults were fixed here on Aug 7. The importer never applied [Automated] at
 * all, and worse, its "imported" entry listed "Travel Imported" then "Automated"
 * — NEITHER of which exists in the account, since the real tag is "[Automated]"
 * with brackets. A tag that resolves to nothing is dropped silently by design,
 * so travel threads the app read and filed carried no sign it had touched them.
 */
const TAGS = {
  /** On every thread this importer acts on, filed or not. */
  automated: ["[Automated]", "automated"],
  /** The travel marker. "Travel Imported" does not exist yet; "Travel" does. */
  imported: ["Travel Imported", "Travel"],
  needsReview: ["Needs Review", "needs review"]
} as const;

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;|&rsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * ORIENTATION and INDOC are both real purposes on the trip; the rest map across.
 *
 * The parser can still return INTERVIEW — it is left in the model's enum on
 * purpose, because an email really can say "interview" and forcing the model to
 * call it something else would cost accuracy. It is folded onto RECRUITING_VISIT
 * here instead, at the one point where an outside purpose enters the system.
 */
function tripPurpose(purpose: LlmTravelEmail["purpose"]): string {
  return normalizeTravelPurpose(purpose);
}

/** A short human line describing the itinerary, for the Front comment. */
function describe(travel: LlmTravelEmail): string {
  const parts = travel.segments.map((s) => {
    const route = s.from_airport && s.to_airport ? `${s.from_airport}->${s.to_airport}` : "";
    const when = [s.date, s.depart_local].filter(Boolean).join(" ");
    return [s.type === "FLIGHT" ? `${s.vendor} ${s.number}`.trim() : s.type, route, when]
      .filter(Boolean)
      .join(" ");
  });
  return parts.join("; ") || "no itinerary found";
}

/**
 * `annotate` controls whether we write BACK to Front (a comment plus a tag).
 * Separate from `apply` on purpose: a comment is visible to everyone on the
 * thread, so a one-off backfill can file trips quietly while the live webhook
 * — where the coordinator is expecting an answer where they tagged it — talks.
 */
export async function processTravelConversation(
  conversationId: string,
  options: { apply: boolean; annotate?: boolean } = { apply: false }
): Promise<TravelImportResult> {
  const annotate = options.annotate ?? options.apply;
  const base = {
    conversationId,
    tripId: null,
    travelerName: null,
    hireId: null,
    warnings: [] as string[],
    travel: null,
    match: null
  };

  const messages = await getMessages(conversationId);
  if (!messages.length) {
    return { ...base, outcome: "no-itinerary", summary: "The thread has no readable messages." };
  }

  // Only the fields this importer reads. Declared rather than reaching for `any`
  // so the shape is visible and the build's no-explicit-any rule passes.
  type FrontRecipient = { role?: string; handle?: string };
  type FrontMessageLike = {
    subject?: string;
    body?: string;
    text?: string;
    created_at?: number;
    author?: { email?: string };
    recipients?: FrontRecipient[];
  };

  // The booking is the OLDEST message; replies and thank-yous come after it.
  // Front returns messages NEWEST-FIRST (confirmed against real production
  // data from conversation cnv_1hmu0uhm), so the booking is the LAST entry,
  // not messages[0].
  const first = messages[messages.length - 1] as unknown as FrontMessageLike;
  const subject: string = first.subject ?? "";
  const body = stripHtml(first.body ?? first.text ?? "");
  const sentAt = new Date((first.created_at ?? 0) * 1000);
  const senderEmail: string | null =
    first.author?.email ??
    (first.recipients ?? []).find((r) => r.role === "from")?.handle ??
    null;
  const addresses: string[] = (first.recipients ?? [])
    .map((r) => String(r.handle ?? ""))
    .filter(Boolean);

  const { travel, error } = await extractTravelFromEmail({ subject, body }, sentAt);
  if (error || !travel) {
    return { ...base, outcome: "extraction-failed", summary: `Could not read the email: ${error ?? "no result"}` };
  }

  const audit = auditTravel(travel);
  const warnings = [...audit.problems, ...audit.observations];
  if (travel.segments.length === 0) {
    return {
      ...base, travel, warnings, outcome: "no-itinerary",
      summary: "No travel itinerary in this email — nothing to file."
    };
  }

  const match = await matchTraveler(travel, addresses, senderEmail);
  const summaryLine = describe(travel);

  if (!match.best || !match.confident) {
    const summary = match.best
      ? `Could not confidently identify the traveller. ${match.note}`
      : `No roster match for "${travel.traveler_name || "(no name found)"}".`;
    if (annotate) {
      await comment(
        conversationId,
        `SkyShare Journey read this as travel (${summaryLine}) but did NOT file it: ${summary} Tagged for review.`
      );
      await tag(conversationId, TAGS.needsReview);
    }
    return {
      ...base, travel, match, warnings,
      travelerName: travel.traveler_name || null,
      hireId: match.best?.hireId ?? null,
      outcome: "no-traveler",
      summary
    };
  }

  const hire = match.best;
  const flights = travel.segments.filter((s) => s.type === "FLIGHT");
  const firstFlight = flights[0];
  const arrival = firstFlight
    ? segmentInstant(firstFlight.date, firstFlight.arrive_local, firstFlight.to_airport)
    : null;
  const indocStart = travel.indoc_date
    ? segmentInstant(travel.indoc_date, travel.indoc_time_local, firstFlight?.to_airport ?? "SLC")
    : null;

  const noteParts = [
    travel.notes,
    travel.ground_transport ? `Ground: ${travel.ground_transport}` : "",
    travel.action_items.length ? `To do: ${travel.action_items.join(" ")}` : "",
    audit.observations.length ? `Note: ${audit.observations.join(" ")}` : "",
    audit.problems.length ? `CHECK: ${audit.problems.join(" ")}` : ""
  ].filter(Boolean);

  const tripData = {
    newHireId: hire.hireId,
    candidateId: hire.candidateId,
    purpose: tripPurpose(travel.purpose),
    status: "BOOKED",
    originAirport: firstFlight?.from_airport || null,
    destinationAirport: firstFlight?.to_airport || null,
    orientationDate: hire.orientationDate,
    indocStart,
    requestedArrival: arrival,
    preferredAirline: firstFlight?.vendor || null,
    additionalTransport: travel.ground_transport || null,
    notes: noteParts.join(" | ") || null,
    bookedBy: travel.booked_by || senderEmail,
    sourceConversationId: conversationId,
    sourceEmailUrl: `https://app.frontapp.com/open/${conversationId}`,
    // Only a PROBLEM flags the trip. An outbound-only booking is the normal
    // case for orientation travel; flagging it would train everyone to ignore
    // the flag.
    needsReview: audit.problems.length > 0
  };

  if (!options.apply) {
    const existing = await prisma.travelTrip.findUnique({
      where: { sourceConversationId: conversationId },
      select: { id: true }
    });
    return {
      ...base, travel, match, warnings,
      travelerName: hire.name,
      hireId: hire.hireId,
      tripId: existing?.id ?? null,
      outcome: existing ? "updated" : audit.problems.length ? "needs-review" : "imported",
      summary: `Would ${existing ? "update" : "create"} a trip for ${hire.name}: ${summaryLine}`
    };
  }

  const existing = await prisma.travelTrip.findUnique({
    where: { sourceConversationId: conversationId },
    select: { id: true }
  });

  const trip = existing
    ? await prisma.travelTrip.update({ where: { id: existing.id }, data: tripData, select: { id: true } })
    : await prisma.travelTrip.create({ data: tripData, select: { id: true } });

  // Rebuild the itinerary rows rather than diffing: the email is the source of
  // truth for this trip, and a re-send is a correction, not an addition.
  await prisma.travelItem.deleteMany({ where: { tripId: trip.id } });
  await prisma.travelItem.createMany({
    data: travel.segments.map((s) => ({
      tripId: trip.id,
      type: s.type,
      vendor: s.vendor || null,
      confirmation: s.confirmation || null,
      detail:
        [
          s.number ? `${s.vendor} ${s.number}`.trim() : s.vendor,
          s.from_airport && s.to_airport ? `${s.from_airport} to ${s.to_airport}` : "",
          s.depart_local && s.arrive_local ? `departs ${s.depart_local}, arrives ${s.arrive_local} local` : ""
        ]
          .filter(Boolean)
          .join(" — ")
          .slice(0, 300) || s.detail || null,
      startsAt: segmentInstant(s.date, s.depart_local, s.from_airport),
      endsAt: segmentInstant(s.date, s.arrive_local, s.to_airport),
      amount: s.amount > 0 ? s.amount : null,
      selfBooked: s.self_booked,
      reimbursement: s.self_booked ? "NEEDED" : "NOT_NEEDED"
    }))
  });

  const flagged = audit.problems.length > 0;
  if (annotate) {
    await comment(
      conversationId,
      `SkyShare Journey filed this under Travel for ${hire.name}: ${summaryLine}.` +
        (audit.observations.length ? ` ${audit.observations.join(" ")}` : "") +
        (flagged ? ` FLAGGED FOR REVIEW — ${audit.problems.join(" ")}` : "")
    );
    await tag(conversationId, flagged ? TAGS.needsReview : TAGS.imported);
  }

  return {
    ...base, travel, match, warnings,
    travelerName: hire.name,
    hireId: hire.hireId,
    tripId: trip.id,
    outcome: existing ? "updated" : flagged ? "needs-review" : "imported",
    summary: `${existing ? "Updated" : "Created"} a trip for ${hire.name}: ${summaryLine}`
  };
}

/** A note on the thread is courtesy, never the work — its failure must not fail the import. */
async function comment(conversationId: string, body: string): Promise<void> {
  try {
    await addComment(conversationId, body);
  } catch {
    /* ignored on purpose */
  }
}

/**
 * Apply one or more tags, ALWAYS including [Automated].
 *
 * Callers pass only the specific marker; the automated one is added here rather
 * than at each call site, so a new branch cannot forget it. That is how the
 * needs-review path came to be untagged in the first place.
 */
async function tag(conversationId: string, ...entries: readonly (readonly string[])[]): Promise<void> {
  try {
    const ids: string[] = [];
    for (const names of [TAGS.automated, ...entries]) {
      const id = await resolveTagIdByNames([...names]);
      if (id && !ids.includes(id)) ids.push(id);
    }
    if (ids.length) await addTags(conversationId, ids);
  } catch {
    /* a tag is a label, not the work */
  }
}
