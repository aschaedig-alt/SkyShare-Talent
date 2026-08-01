import Anthropic from "@anthropic-ai/sdk";
import { zonedWallClockToUtc } from "@/lib/booking/timezone";
import { DEFAULT_TIMEZONE } from "@/lib/calendar/timezones";

/**
 * LLM extraction of a travel itinerary from an ordinary email.
 *
 * WHY THIS EXISTS. travel-confirmation.ts reads machine-generated confirmations
 * with labelled fields. Real internal mail is prose. Measured against the first
 * real one (Gabby Lorenzi to Tara Ward, 28 Jul 2026) the regex parser got the
 * route and the airline and nothing else:
 *
 *   - the flight DATE came back null. The sentence reads "Tuesday, August 4"
 *     with no year, and every date pattern in that file requires a 4-digit year.
 *   - it invented a HOTEL booking, because "access to the stock room" contains
 *     the word "room".
 *   - flight number DL2674, the 6:00 AM departure and the 8:22 AM arrival were
 *     all dropped into a detail blob rather than captured.
 *
 * A colleague writing "I have you booked on Delta DL2674 for Tuesday" is not
 * going to start emitting labelled fields, so the reader has to cope with prose.
 *
 * TWO RULES THIS FILE EXISTS TO ENFORCE, both learned the hard way elsewhere in
 * the codebase:
 *
 * 1. THE MODEL NEVER RETURNS AN INSTANT. It returns a local wall-clock time and
 *    the airport it belongs to; this file converts. A departure time printed in
 *    an email is local to the airport, and letting a model do zone arithmetic is
 *    how "every flight is six hours off" happened in travel-confirmation.ts.
 * 2. EVERY FIELD CARRIES ITS EVIDENCE — the verbatim sentence it was read from,
 *    so a human can audit the trip without opening the email.
 *
 * Nothing here writes. It returns a proposal for review.
 */

/**
 * Overridable without a deploy, same as the sibling extractors. The default is
 * unchanged on purpose — a misread flight time strands somebody at an airport,
 * so the cheaper model is a deliberate choice, not a silent default.
 */
export const DEFAULT_MODEL = process.env.TRAVEL_EXTRACT_MODEL || "claude-opus-5";

/** Airports we actually fly crew through. Anything else falls back to the office zone. */
const AIRPORT_TZ: Record<string, string> = {
  SLC: "America/Denver", PVU: "America/Denver", BOI: "America/Boise", DEN: "America/Denver",
  JAC: "America/Denver", SUN: "America/Boise", BZN: "America/Denver", PHX: "America/Phoenix",
  SDL: "America/Phoenix", SCF: "America/Phoenix", TUS: "America/Phoenix",
  LAS: "America/Los_Angeles", LAX: "America/Los_Angeles", SAN: "America/Los_Angeles",
  SFO: "America/Los_Angeles", SJC: "America/Los_Angeles", OAK: "America/Los_Angeles",
  BUR: "America/Los_Angeles", SNA: "America/Los_Angeles", PSP: "America/Los_Angeles",
  SEA: "America/Los_Angeles", PDX: "America/Los_Angeles", RNO: "America/Los_Angeles",
  DFW: "America/Chicago", DAL: "America/Chicago", IAH: "America/Chicago", HOU: "America/Chicago",
  AUS: "America/Chicago", SAT: "America/Chicago", MSP: "America/Chicago", ORD: "America/Chicago",
  MDW: "America/Chicago", STL: "America/Chicago", MCI: "America/Chicago", NEW: "America/Chicago",
  ATL: "America/New_York", MCO: "America/New_York", TPA: "America/New_York", MIA: "America/New_York",
  FLL: "America/New_York", PBI: "America/New_York", JFK: "America/New_York", LGA: "America/New_York",
  EWR: "America/New_York", BOS: "America/New_York", DCA: "America/New_York", IAD: "America/New_York",
  BWI: "America/New_York", CLT: "America/New_York", PHL: "America/New_York", DTW: "America/New_York",
  CLE: "America/New_York", CVG: "America/New_York", IND: "America/New_York", BNA: "America/Chicago",
  HNL: "Pacific/Honolulu", ANC: "America/Anchorage"
};

export function airportTimezone(code: string | null | undefined): string {
  if (!code) return DEFAULT_TIMEZONE;
  return AIRPORT_TZ[code.trim().toUpperCase()] ?? DEFAULT_TIMEZONE;
}

/** Empty string means "the email did not say" — a null would add a schema union. */
export type TravelSegment = {
  type: "FLIGHT" | "CAR" | "HOTEL" | "TRANSPORT" | "OTHER";
  vendor: string;
  number: string;
  from_airport: string;
  to_airport: string;
  date: string;
  weekday: string;
  depart_local: string;
  arrive_local: string;
  confirmation: string;
  detail: string;
  self_booked: boolean;
  amount: number;
  evidence: string;
};

export type LlmTravelEmail = {
  traveler_name: string;
  traveler_email: string;
  purpose: "ORIENTATION" | "INDOC" | "TRAINING" | "INTERVIEW" | "RECRUITING_VISIT" | "OTHER";
  segments: TravelSegment[];
  /** Outbound-only mail is the norm here; the caller surfaces it rather than guessing. */
  has_return_leg: boolean;
  indoc_date: string;
  indoc_time_local: string;
  indoc_location: string;
  ground_transport: string;
  booked_by: string;
  action_items: string[];
  notes: string;
};

const SEGMENT_PROPS = {
  type: { type: "string", enum: ["FLIGHT", "CAR", "HOTEL", "TRANSPORT", "OTHER"] },
  vendor: { type: "string" },
  number: { type: "string" },
  from_airport: { type: "string" },
  to_airport: { type: "string" },
  date: { type: "string" },
  weekday: { type: "string" },
  depart_local: { type: "string" },
  arrive_local: { type: "string" },
  confirmation: { type: "string" },
  detail: { type: "string" },
  self_booked: { type: "boolean" },
  amount: { type: "number" },
  evidence: { type: "string" }
};

function buildSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "traveler_name", "traveler_email", "purpose", "segments", "has_return_leg",
      "indoc_date", "indoc_time_local", "indoc_location", "ground_transport",
      "booked_by", "action_items", "notes"
    ],
    properties: {
      traveler_name: { type: "string" },
      traveler_email: { type: "string" },
      purpose: {
        type: "string",
        enum: ["ORIENTATION", "INDOC", "TRAINING", "INTERVIEW", "RECRUITING_VISIT", "OTHER"]
      },
      segments: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: Object.keys(SEGMENT_PROPS),
          properties: SEGMENT_PROPS
        }
      },
      has_return_leg: { type: "boolean" },
      indoc_date: { type: "string" },
      indoc_time_local: { type: "string" },
      indoc_location: { type: "string" },
      ground_transport: { type: "string" },
      booked_by: { type: "string" },
      action_items: { type: "array", items: { type: "string" } },
      notes: { type: "string" }
    }
  };
}

const SYSTEM = `You read internal company email about a person's travel and return
the itinerary as structured data. SkyShare is a private-aviation operator; these
emails are usually a coordinator telling a new hire how they are getting to
orientation or INDOC in Salt Lake City.

The writer is a colleague, not a booking system. Expect prose, warmth,
exclamation marks and missing fields. Extract only what is actually stated.

USE THE EMPTY STRING for any text field the email does not state, and 0 for an
amount that is not stated. Never invent a value and never write "unknown".

1. NEVER CONVERT A TIME. Report departure and arrival exactly as the email
   writes them, as 24-hour HH:MM local to that airport, in depart_local and
   arrive_local. "6:00 AM" becomes "06:00". The calling code does the timezone
   work; if you adjust a time yourself you will make it wrong.

2. RESOLVE THE YEAR FROM THE SENT DATE. These emails write "Tuesday, August 4"
   with no year. The sent date is given to you. Pick the year that puts the
   trip in the near future relative to it, and put the result in "date" as
   YYYY-MM-DD. Copy the weekday the email states into "weekday" (e.g.
   "Tuesday") so the caller can check the date really is that weekday. If no
   weekday is stated leave it empty.

3. ONE SEGMENT PER BOOKED THING. A flight there and a flight back are two
   segments. Set has_return_leg true ONLY if a return or homeward journey is
   actually described. An outbound-only email is common and normal — say false
   rather than inventing a return.

4. A ROOM IS NOT ALWAYS A HOTEL. "access to the stock room", "the ops room",
   "conference room" are not accommodation. Only add a HOTEL segment when the
   email describes somewhere the traveller is SLEEPING. This exact mistake has
   already put a fictional hotel on a real trip.

5. BADGES, PAPERWORK AND PARKING ARE NOT SEGMENTS. A hangar access badge, a
   gate code, a uniform fitting or a form to fill in belongs in action_items —
   a short imperative line each — not in the itinerary.

6. GROUND TRANSPORT IN PROSE. "I'll pick you up from the airport", "a shuttle
   will collect you", "grab an Uber and expense it" go in ground_transport as
   one short sentence naming who is doing what. Only add a TRANSPORT segment if
   there is an actual booking with a vendor or a confirmation number.

7. self_booked means the TRAVELLER paid or booked it themselves and will need
   reimbursing. A coordinator writing "I have you booked" is the company
   booking it: false.

8. INDOC / ORIENTATION START. If the email states when INDOC or orientation
   begins, put the date in indoc_date (YYYY-MM-DD) and the time in
   indoc_time_local as HH:MM, plus where it starts in indoc_location. This is
   NOT a travel segment.

9. PURPOSE. INDOC when the email names indoc or initial training; ORIENTATION
   for a first-day or new-hire orientation; INTERVIEW when they are coming to
   interview. If the email names both orientation and INDOC, choose INDOC.

10. traveler_name is the person TRAVELLING, not the sender. The sender goes in
    booked_by. Both as written. traveler_email only if an address for the
    traveller appears; do not guess one from their name.

11. GIVE THE TRAVELLER'S FULL NAME. The body usually greets them by first name
    only ("Good Morning, Tara,") while the subject carries the full name
    ("Tara Ward - Delta Flight Confirmation"). Use the subject to complete it.
    A first name alone matches nobody in the roster.

"evidence" on each segment is the verbatim sentence you read it from, copied
exactly, long enough to verify without opening the email (roughly 40-160 chars).

notes is anything a coordinator would want on the trip record that has no field
of its own — one or two short sentences at most, or empty.`;

const MAX_CHARS = 12000;

export type TravelEmailResult = {
  travel: LlmTravelEmail | null;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
  error?: string;
};

/**
 * The SUBJECT is not optional context. The first real email opened with "Good
 * Morning, Tara," and named her in full only in the subject line — extracting
 * from the body alone produced the traveller "Tara", which matches nobody.
 */
export function buildTravelRequest(
  email: { subject: string; body: string },
  sentAt: Date,
  model: string = DEFAULT_MODEL
) {
  const sentLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: DEFAULT_TIMEZONE,
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  }).format(sentAt);
  return {
    model,
    max_tokens: 4000,
    system: [
      {
        type: "text" as const,
        text: SYSTEM,
        cache_control: { type: "ephemeral" as const, ttl: "1h" as const }
      }
    ],
    output_config: {
      effort: "low",
      format: { type: "json_schema" as const, schema: buildSchema() }
    },
    messages: [
      {
        role: "user" as const,
        content: `This email was sent on ${sentLabel}.\n\nSubject: ${email.subject}\n\nBody:\n\n${email.body.slice(0, MAX_CHARS)}`
      }
    ]
  };
}

export async function extractTravelFromEmail(
  email: { subject: string; body: string },
  sentAt: Date,
  model: string = DEFAULT_MODEL
): Promise<TravelEmailResult> {
  const zero = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  if (!process.env.ANTHROPIC_API_KEY) {
    return { travel: null, usage: zero, error: "ANTHROPIC_API_KEY not set" };
  }
  const client = new Anthropic();
  try {
    const message = await client.messages.create(buildTravelRequest(email, sentAt, model) as never);
    const raw = (message as Anthropic.Message).content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    const u = (message as Anthropic.Message).usage as Anthropic.Usage & {
      cache_read_input_tokens?: number | null;
      cache_creation_input_tokens?: number | null;
    };
    return {
      travel: raw ? (JSON.parse(raw) as LlmTravelEmail) : null,
      usage: {
        input: u.input_tokens,
        output: u.output_tokens,
        cacheRead: u.cache_read_input_tokens ?? 0,
        cacheWrite: u.cache_creation_input_tokens ?? 0
      }
    };
  } catch (error) {
    return { travel: null, usage: zero, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Turn a stated local wall-clock time at an airport into a real instant.
 * Returns null rather than a guess when the date or time is missing or malformed
 * — a trip with a blank time is honest; one with the wrong time is not.
 */
export function segmentInstant(dateIso: string, localTime: string, airport: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso || "");
  if (!d) return null;
  const t = /^(\d{1,2}):(\d{2})$/.exec(localTime || "");
  const hour = t ? Number(t[1]) : 0;
  const minute = t ? Number(t[2]) : 0;
  if (hour > 23 || minute > 59) return null;
  const zone = airportTimezone(airport);
  const instant = zonedWallClockToUtc(Number(d[1]), Number(d[2]) - 1, Number(d[3]), hour, minute, zone);
  if (Number.isNaN(instant.getTime())) return null;
  // Reject a rolled-over date (Feb 30 in a malformed email) by reading it back.
  const back = new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(instant);
  return back === dateIso ? instant : null;
}

/**
 * Checks that survive the model, split by what they MEAN.
 *
 * problems     — a sign the reading itself may be wrong (a weekday that does not
 *                match the date, a flight that lands before it takes off). These
 *                set needsReview, because the data might be false.
 * observations — true things about the booking worth noticing (outbound with no
 *                return, no hotel). These are NOT review flags: a one-way flight
 *                to orientation is the normal case here, and flagging every one
 *                would make the flag mean nothing.
 *
 * Neither is ever silently corrected. The point is that a human looks.
 */
export type TravelAudit = { problems: string[]; observations: string[] };

export function auditTravel(travel: LlmTravelEmail): TravelAudit {
  const warnings: string[] = [];
  const observations: string[] = [];

  for (const s of travel.segments) {
    // The stated weekday is a free checksum on the year the model resolved.
    if (s.date && s.weekday) {
      const instant = segmentInstant(s.date, "12:00", s.to_airport || s.from_airport);
      if (instant) {
        const actual = new Intl.DateTimeFormat("en-US", {
          timeZone: airportTimezone(s.to_airport || s.from_airport), weekday: "long"
        }).format(instant);
        if (actual.toLowerCase() !== s.weekday.toLowerCase()) {
          warnings.push(
            `The email says ${s.weekday} but ${s.date} is a ${actual} — check the year and the date.`
          );
        }
      }
    }
    if (s.type === "FLIGHT" && !s.date) {
      warnings.push(`Flight ${s.vendor} ${s.number} has no date — it will save without one.`);
    }
    if (s.depart_local && s.arrive_local && s.from_airport && s.to_airport && s.date) {
      const dep = segmentInstant(s.date, s.depart_local, s.from_airport);
      const arr = segmentInstant(s.date, s.arrive_local, s.to_airport);
      if (dep && arr && arr.getTime() < dep.getTime()) {
        warnings.push(
          `${s.from_airport}->${s.to_airport} arrives before it departs once timezones are applied — check the times.`
        );
      }
    }
  }

  const flights = travel.segments.filter((s) => s.type === "FLIGHT");
  if (flights.length > 0 && !travel.has_return_leg) {
    observations.push("Outbound only — no return flight in this email.");
  }
  if (!travel.segments.some((s) => s.type === "HOTEL")) {
    observations.push("No accommodation in this email.");
  }
  if (!travel.traveler_name) warnings.push("No traveller named — this cannot be matched to a person.");

  return { problems: warnings, observations };
}
