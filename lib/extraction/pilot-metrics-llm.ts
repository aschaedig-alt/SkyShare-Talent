import Anthropic from "@anthropic-ai/sdk";
import { METRIC_DEFS } from "@/lib/extraction/pilot-metrics";

/**
 * LLM extraction of pilot flight hours from resume / application text.
 *
 * WHY THIS EXISTS. The regex extractor in pilot-metrics.ts cannot tell an hour
 * count from a number that merely sits near the right words. Audited against
 * the real corpus it produced, out of ~9,500 values: 318 instrument readings of
 * exactly 91 (from the form label "PREVIOUS PART 91 EXPERIENCE?"), 357 values
 * equal to an aircraft type designator (CE-525 read as 525 PIC hours, MU-300 as
 * 300, EMB-120 as 120), and 36 people whose PIC exceeded their total time,
 * which is impossible. Those are only the errors a rule can catch; field-shift
 * errors ("9000 PIC, 11000 ME" read as 11000 PIC) are invisible to any check.
 *
 * Every number therefore comes back with the VERBATIM LINE it was read from, so
 * a human can audit any value without opening the PDF, and values land as
 * SUGGESTED rather than confirmed.
 */

/**
 * The model this extractor runs on, overridable without a deploy.
 *
 * The sibling extractors all read an env var with a default
 * (PAYCOM_EXTRACT_MODEL, ARCHIVE_SUMMARY_MODEL, EVENT_EXTRACTION_MODEL); this
 * one was the only hardcoded value, so switching it meant editing code.
 *
 * THE DEFAULT DELIBERATELY DOES NOT CHANGE. Pilot hours are the highest-stakes
 * extraction in the app — they feed matching, and a wrong number is worse than
 * no number — so quietly dropping to a cheaper model to save money is not a
 * call to make on somebody's behalf. Setting PILOT_METRICS_MODEL=claude-haiku-4-5
 * cuts the cost of the 270-candidate backfill from roughly $5 to $1; make that
 * trade deliberately, and check a sample of the results against the source
 * documents before trusting a whole run on it.
 */
export const DEFAULT_MODEL = process.env.PILOT_METRICS_MODEL || "claude-opus-5";

/**
 * Scalar hour metrics the model returns by name. The two aircraft-specific
 * keys are excluded: they cannot be a single number without saying WHICH
 * aircraft, so they come back as a list of (aircraft, hours) pairs instead.
 */
export const AIRCRAFT_SCOPED_KEYS = ["time_in_type", "pic_time_in_type"];
export const LLM_HOUR_KEYS = METRIC_DEFS.filter(
  (d) => d.kind === "hours" && !AIRCRAFT_SCOPED_KEYS.includes(d.key)
).map((d) => d.key);

export type ExtractedHour = { key: string; value: number; evidence: string };
/** hours/pic_hours use 0 for "not stated" — a null would add a schema union. */
export type TimeInType = { aircraft: string; hours: number; pic_hours: number; evidence: string };

export type LlmPilotMetrics = {
  hours: ExtractedHour[];
  time_in_type: TimeInType[];
  type_ratings: string[];
  certificates: string[];
  medical_class: string | null;
};

/**
 * A LIST of findings, not a fixed object with a nullable slot per metric.
 *
 * The object-with-nulls shape is rejected outright: each nullable field is a
 * union, twelve metrics x (value, evidence) came to 25 unions against a limit
 * of 16. The list also states the semantics better — a metric the document
 * does not mention is simply absent, so there is no null to interpret and both
 * value and evidence can be required.
 */
function buildSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["hours", "time_in_type", "type_ratings", "certificates", "medical_class"],
    properties: {
      hours: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["key", "value", "evidence"],
          properties: {
            key: { type: "string", enum: [...LLM_HOUR_KEYS] },
            value: { type: "number" },
            evidence: { type: "string" }
          }
        }
      },
      time_in_type: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["aircraft", "hours", "pic_hours", "evidence"],
          properties: {
            aircraft: { type: "string" },
            hours: { type: "number" },
            pic_hours: { type: "number" },
            evidence: { type: "string" }
          }
        }
      },
      type_ratings: { type: "array", items: { type: "string" } },
      certificates: { type: "array", items: { type: "string" } },
      medical_class: { anyOf: [{ type: "string" }, { type: "null" }] }
    }
  };
}

/** Findings keyed by metric, for callers that want lookup by name. */
export function byKey(metrics: LlmPilotMetrics): Map<string, ExtractedHour> {
  const map = new Map<string, ExtractedHour>();
  for (const h of metrics.hours) if (!map.has(h.key)) map.set(h.key, h);
  return map;
}

/**
 * The prompt is written against the specific ways the regex went wrong. Each
 * rule below corresponds to a measured failure mode in the corpus, not a
 * hypothetical one.
 */
const SYSTEM = `You read pilot resumes and job applications and extract flight time.

Report a metric ONLY when the document states that number as that pilot's
flight time. If a figure is not stated, LEAVE IT OUT of the hours list
entirely. Never infer, never estimate, never add figures together, and never
carry a number over from a similar field. Returning fewer, correct values is
always better than filling in every field.

These are the mistakes that matter most, drawn from real errors on this corpus:

1. AIRCRAFT DESIGNATORS ARE NOT HOURS. "CE-525", "MU-300", "EMB-120", "LR31",
   "PC-12", "CE-750", "BE1900" name aircraft. A type rating line such as
   "Type Ratings: CE-750 (PIC) // CE-525 Series (SIC)" contains NO hour values.
   Do not read 750, 525, 300, 120 or similar as PIC or SIC time.

2. FORM LABELS ARE NOT VALUES. Blank application forms list field names in a
   run: "TOTAL INSTRUMENT: PREVIOUS PART 91 EXPERIENCE? PREVIOUS PART 135".
   The 91 and 135 are regulation parts, not hours. If a form's labels appear
   with no filled-in figures, return an empty hours list.

3. KEEP FIELDS ALIGNED. In a list like "14000 Total Time, 9000 PIC, 11000 ME,
   8000 Jet", each number belongs to the label it precedes. Do not shift by one.

4. RESPECT ARITHMETIC. PIC, SIC, night, instrument, cross-country, multi-engine,
   turbine and jet time are all subsets of total time and cannot exceed it. If
   your reading would break that, you have misread — omit the metric instead.

5. SUBSET FIELDS ARE DISTINCT. "Actual instrument" is not the same as total
   instrument time; "turbine PIC" is not "turbine". Only report the field the
   document actually names.

6. GARBLED TEXT. Some documents are OCR noise. If the text around a number is
   unreadable, omit it rather than guessing.

7. RECENCY WINDOWS ARE NOT HOURS. Labels like "HOURS IN AIRCRAFT LAST 12",
   "HRS FLOWN LAST 12 MOS", "Total Hours in Last 90" and "In the last 10" name
   a TIME WINDOW. The number directly after them is usually the window itself
   (12 months, 90 days), not a flight-time total. Never record one as hours.

8. WEIGHT CLASSES ARE NOT HOURS. "Twin Engine Under 12,500" and "Twin Engine
   Over 12,500" split multi-engine time by aircraft weight; the 12,500 is
   POUNDS. The hours are whatever figure follows the label, never the 12,500.

VOCABULARY — the corpus writes each metric many ways. Treat these as the same:
  total_time        Total Time / Total / Total Hours / Total Flight Time /
                    Total Flight Hours / TT / Flight Time
  pic               PIC / Pilot In Command / Pilot-In-Command / Total PIC /
                    PIC Time
  sic               SIC / Second In Command / Total SIC / FO / First Officer
  multi_engine      Multi-Engine / Multi Engine / Multi / MEL /
                    Multi-Engine Land / Twin Engine
  multi_engine_pic  Multi-Engine PIC / Multi-engine (PIC)
  turbine           Turbine / Total Turbine / Turboprop / Turbo Prop /
                    Turbo-Prop / Turbine Time
  turbine_pic       Turbine PIC / Turbine (PIC) / PIC Turbine
  jet               Jet / Turbojet / Jet Time
  jet_pic           Jet PIC / Jet (PIC)
  night             Night / Night Time
  instrument        Instrument / Total Instrument / Instrument Time / IFR /
                    Actual Instrument / Simulated Instrument /
                    Instrument (Simulated & Actual)
  cross_country     Cross Country / Cross-Country / X-Country / XC

INSTRUMENT is now three separate fields — record whichever the document names:
  instrument            a combined or total instrument figure
                        ("Total Instrument", "Instrument", "IFR")
  instrument_actual     explicitly actual/IMC ("Actual Instrument", "IMC")
  instrument_simulated  explicitly hood/simulated ("Simulated Instrument")
If only actual and simulated are given, record those two and LEAVE instrument
out — do not add them together yourself. FLIGHT SIMULATOR device time
("Flight Simulator", "FTD", "AATD", "Sim" as a device) is NOT flight time and
must never be recorded as any of them.

single_pilot: only from an explicit "Single Pilot" label. It is NOT
single-engine time — those are unrelated.

recency_12mo: hours flown in roughly the last 12 months, from labels like
"HRS FLOWN LAST 12 MOS" or "Hours flown in the last twelve months". Record the
HOURS FIGURE, never the window itself (see rule 7). If the form shows the label
with no figure filled in, leave it out.

hours_in_type_applying: from "HRS IN AIRCRAFT APPLYING FOR" — hours in the
aircraft this person applied to fly. Same rule: the hours, not the window.

TIME IN TYPE is a separate list, because it is meaningless without naming the
aircraft. For each aircraft where the document states hours in that type, add
one entry: the aircraft as written ("PC-12", "CE-560XL", "G450"), the hours,
and the PIC portion if separately stated (use 0 when it is not). A bare type
rating with no hours attached is NOT an entry — it belongs in type_ratings.
Formats seen here include "CE-750 257.9TT / 115.7 PF" and "PC12 738".

NEVER MAP THESE to any metric — they are real numbers but not ones we track:
Dual Given, Dual Received, Instruction Given, Solo, Single Engine / SEL /
Single-Engine Land, Flight Instructor hours, and any simulator device time.

For every metric you report, "evidence" must be the exact substring of the
document you read it from, copied verbatim, long enough for a human to verify
it (roughly 40-120 characters). Report each metric at most once.

Round hour values to the nearest whole number. Type ratings and certificates
are lists of short strings exactly as written; return empty arrays when absent.
medical_class is the FAA medical class if stated (e.g. "1st Class"), else null.`;

/** Cap per document — the flight-time block is always near the top. */
const MAX_CHARS = 14000;

export type LlmExtractResult = {
  metrics: LlmPilotMetrics | null;
  /** cacheRead is billed at ~0.1x input; cacheWrite at ~1.25x (or 2x at 1h TTL). */
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
  error?: string;
};

/**
 * Whether a model accepts output_config.effort. The 4.5-generation Haiku and
 * Sonnet do not and return a 400; Opus 4.5+ and everything newer do. Unknown
 * models are assumed to support it — being wrong that way is a loud 400 on the
 * first call, whereas wrongly omitting it just costs a little more.
 */
function supportsEffort(model: string): boolean {
  return !/haiku-4-5|sonnet-4-5/i.test(model);
}

export function buildExtractionRequest(text: string, model: string = DEFAULT_MODEL) {
  return {
    model,
    max_tokens: 8000,
    // The rules below are ~73% of every request and byte-identical on all of
    // them, so they are cached rather than re-billed 2,747 times. A 1h TTL
    // (rather than the 5m default) is what keeps the cache alive across a long
    // batch; cache reads bill at roughly a tenth of the input rate.
    system: [
      {
        type: "text" as const,
        text: SYSTEM,
        cache_control: { type: "ephemeral" as const, ttl: "1h" as const }
      }
    ],
    // Low effort: this is careful reading, not deep reasoning. Thinking stays
    // ON (disabling it on this model leaks internal tags into the response).
    //
    // NOT EVERY MODEL TAKES effort. Haiku 4.5 and Sonnet 4.5 reject it outright
    // ("This model does not support the effort parameter", 400) — and because
    // every caller treats a failed extraction as "fall back to regex", sending it
    // to one of those models does not surface as an error at all: it quietly
    // produces regex metrics, which misread hours badly. Omit it there instead.
    output_config: {
      ...(supportsEffort(model) ? { effort: "low" as const } : {}),
      format: { type: "json_schema" as const, schema: buildSchema() }
    },
    messages: [{ role: "user" as const, content: `Document text:\n\n${text.slice(0, MAX_CHARS)}` }]
  };
}

/** Extract from one document's text. Returns null metrics on any failure. */
export async function extractPilotMetricsLlm(
  text: string,
  model: string = DEFAULT_MODEL
): Promise<LlmExtractResult> {
  const zero = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  if (!process.env.ANTHROPIC_API_KEY) {
    return { metrics: null, usage: zero, error: "ANTHROPIC_API_KEY not set" };
  }
  const client = new Anthropic();
  try {
    const message = await client.messages.create(buildExtractionRequest(text, model) as never);
    const raw = (message as Anthropic.Message).content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    const u = (message as Anthropic.Message).usage as Anthropic.Usage & {
      cache_read_input_tokens?: number | null;
      cache_creation_input_tokens?: number | null;
    };
    const usage = {
      input: u.input_tokens,
      output: u.output_tokens,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0
    };
    return { metrics: raw ? (JSON.parse(raw) as LlmPilotMetrics) : null, usage };
  } catch (error) {
    return { metrics: null, usage: zero, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Final guard, applied after the model returns: drop any subset figure that
 * exceeds total time. The prompt asks for this, but a schema cannot enforce it
 * and a wrong number is worse than a missing one.
 */
export function dropImpossible(metrics: LlmPilotMetrics): { metrics: LlmPilotMetrics; dropped: string[] } {
  const total = metrics.hours.find((h) => h.key === "total_time")?.value ?? null;
  const dropped: string[] = [];
  if (total === null) return { metrics, dropped };
  const kept = metrics.hours.filter((h) => {
    if (h.key === "total_time" || h.value <= total) return true;
    dropped.push(`${h.key}=${h.value} > total_time=${total}`);
    return false;
  });
  return { metrics: { ...metrics, hours: kept }, dropped };
}
