import Anthropic from "@anthropic-ai/sdk";
import { parseEventEmail, type ParsedEventDraft } from "@/lib/events/parse-event-email";
import { startOfOfficeDay } from "@/lib/dates/display";
import { isEventType } from "@/lib/events/constants";

/**
 * Read an event invitation out of an email using Claude.
 *
 * Why the model rather than more regex: these emails have no shared format. The
 * pattern-matching floor in parse-event-email.ts gets the name, date and contact
 * right on the real USU career-fair email, but picks the letterhead instead of
 * the venue ("Utah State University Aviation Technology" over "Logan-Cache
 * Airport"), the hotel's link instead of the event's, and the FBO's phone
 * instead of the organizer's. Those are judgement calls about which of several
 * plausible candidates is meant — exactly what pattern-matching cannot do and a
 * model can.
 *
 * Belt and braces, on purpose:
 *  - No API key, an API error, or a refusal => the regex draft is returned. The
 *    feature degrades, it does not break.
 *  - Any field the model leaves null falls back to the regex value, so the model
 *    can only ever add information.
 *  - Dates come back as plain yyyy-mm-dd and are re-anchored to the office
 *    timezone here rather than trusted as instants — a bare date read in UTC
 *    lands on the wrong calendar square in Mountain time.
 *
 * Everything returned is still only a SUGGESTION shown for review before any
 * write. See lib/data/events.ts for the write side.
 */

// Extraction is low-volume (a handful of emails at a time) and a wrong date on a
// career fair costs the fair, so this runs on the strongest model by default.
// Override per deployment if that trade-off changes.
const EVENT_EXTRACTION_MODEL = process.env.EVENT_EXTRACTION_MODEL || "claude-opus-5";

const SYSTEM_PROMPT = [
  "You read an email sent to an aviation company's recruiting inbox and extract the details of the",
  "RECRUITING EVENT it is inviting them to (a career fair, school visit, conference, airshow, or",
  "community event).",
  "",
  "Rules:",
  "- Extract only what the email actually states. Never infer or invent a detail. If a field is not",
  "  stated, return null for it. A null is always better than a guess.",
  "- venue is where the event is HELD (e.g. an airport, hangar, or conference center) — not the",
  "  sender's letterhead or mailing address.",
  "- website is the EVENT's or host organization's own page. Never a hotel, car rental, map, or",
  "  social link, even when the email lists them.",
  "- contactName/contactEmail/contactPhone belong to the ORGANIZER who sent the email. Do not use a",
  "  third party's number (an FBO, a hotel, a rental desk) even when it appears nearby.",
  "- Dates are yyyy-mm-dd. endsAt only for a genuinely multi-day event, otherwise null.",
  "- aircraftMentioned is true when the email discusses a static display, ramp space, air-stairs, a",
  "  GPU, or otherwise bringing an aircraft.",
  "- notes: a few short lines of practical detail worth keeping (arrival time, what the booth",
  "  includes, fees, parking). Not a summary of the whole email.",
].join("\n");

const NULLABLE_STRING = { anyOf: [{ type: "string" }, { type: "null" }] } as const;

const EVENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: NULLABLE_STRING,
    type: {
      type: "string",
      enum: ["CAREER_FAIR", "SCHOOL", "CONFERENCE", "COMMUNITY", "AIRSHOW", "OTHER"],
    },
    startsAt: NULLABLE_STRING,
    endsAt: NULLABLE_STRING,
    timeOfDay: NULLABLE_STRING,
    venue: NULLABLE_STRING,
    city: NULLABLE_STRING,
    state: NULLABLE_STRING,
    website: NULLABLE_STRING,
    contactName: NULLABLE_STRING,
    contactEmail: NULLABLE_STRING,
    contactPhone: NULLABLE_STRING,
    shipToAddress: NULLABLE_STRING,
    aircraftMentioned: { type: "boolean" },
    notes: NULLABLE_STRING,
    isEventInvitation: { type: "boolean" },
  },
  required: [
    "name",
    "type",
    "startsAt",
    "endsAt",
    "timeOfDay",
    "venue",
    "city",
    "state",
    "website",
    "contactName",
    "contactEmail",
    "contactPhone",
    "shipToAddress",
    "aircraftMentioned",
    "notes",
    "isEventInvitation",
  ],
} as const;

type ModelEvent = {
  [K in keyof typeof EVENT_SCHEMA.properties]: unknown;
};

export type ExtractedEvent = ParsedEventDraft & {
  /** The model's read on whether this email is an event invitation at all. */
  isEventInvitation: boolean;
  /** Which path produced this draft — surfaced so the UI can be honest about it. */
  source: "ai" | "pattern";
};

const str = (v: unknown) => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t && t.toLowerCase() !== "null" ? t : null;
};

/** yyyy-mm-dd from the model -> an instant at midnight in the office timezone. */
function toInstant(v: unknown): string | null {
  const day = str(v);
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return startOfOfficeDay(day)?.toISOString() ?? null;
}

/**
 * The model returns the domain as the email printed it ("aviation.usu.edu"),
 * which renders as a relative link and 404s inside our own app. A scheme is
 * added so the stored value is always a usable absolute URL.
 */
function toUrl(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, "")}`;
}

/** Two-letter postal code, since the model sometimes writes the state in full. */
function toStateCode(v: unknown, fallback: string | null): string | null {
  const s = str(v);
  if (!s) return fallback;
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  return fallback ?? s.slice(0, 2).toUpperCase();
}

export function isEventExtractionConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Best draft available for this email: the model's read where it succeeds,
 * pattern-matching everywhere it does not.
 */
export async function extractEventFromEmail(
  rawText: string,
  subject = ""
): Promise<ExtractedEvent> {
  const fallback = parseEventEmail(rawText, subject);
  const patternDraft: ExtractedEvent = {
    ...fallback,
    // Without the model, "is this an event?" is the pattern-matcher's call, and
    // it only says yes when it found both event words and a real date.
    isEventInvitation: Boolean(fallback.startsAt),
    source: "pattern",
  };

  if (!isEventExtractionConfigured() || !rawText.trim()) return patternDraft;

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: EVENT_EXTRACTION_MODEL,
      // Roomy: on this model thinking is on by default and shares the budget
      // with the response, so a tight cap truncates the JSON rather than the prose.
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      // Extraction from a short document is not a reasoning-heavy task, and low
      // effort keeps it quick; the schema does the structural work.
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: EVENT_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: `Subject: ${subject || "(none)"}\n\n${rawText.slice(0, 24000)}`,
        },
      ],
    });

    // A declined request returns 200 with no usable content — treat it as a miss
    // and fall back rather than reading content[0] and throwing.
    if (response.stop_reason === "refusal") return patternDraft;

    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    if (!text.trim()) return patternDraft;

    const parsed = JSON.parse(text) as ModelEvent;

    return {
      name: str(parsed.name) ?? fallback.name,
      type: isEventType(parsed.type) ? parsed.type : fallback.type,
      startsAt: toInstant(parsed.startsAt) ?? fallback.startsAt,
      endsAt: toInstant(parsed.endsAt) ?? fallback.endsAt,
      timeOfDay: str(parsed.timeOfDay) ?? fallback.timeOfDay,
      venue: str(parsed.venue) ?? fallback.venue,
      city: str(parsed.city) ?? fallback.city,
      state: toStateCode(parsed.state, fallback.state),
      website: toUrl(parsed.website) ?? fallback.website,
      contactName: str(parsed.contactName) ?? fallback.contactName,
      contactEmail: str(parsed.contactEmail) ?? fallback.contactEmail,
      contactPhone: str(parsed.contactPhone) ?? fallback.contactPhone,
      shipToAddress: str(parsed.shipToAddress) ?? fallback.shipToAddress,
      aircraftMentioned: parsed.aircraftMentioned === true || fallback.aircraftMentioned,
      notes: str(parsed.notes) ?? fallback.notes,
      isEventInvitation: parsed.isEventInvitation !== false,
      source: "ai",
    };
  } catch (error) {
    // Never let extraction failure cost the user the draft — the pattern read is
    // still useful, and the UI shows which path produced it.
    console.error("Event email extraction failed:", error);
    return patternDraft;
  }
}
