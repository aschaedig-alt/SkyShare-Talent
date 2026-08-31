import Anthropic from "@anthropic-ai/sdk";

/**
 * LLM reading of a JOB POSTING into structured hiring requirements.
 *
 * WHY THIS EXISTS. The hand-written parsers in lib/imports/job-pdf-parser.ts are
 * anchored to literal strings, and their own comments record what that costs: the
 * careers site was redesigned, the parser wanted "Job Location:" while the page
 * said "Location:", and every posting printed from it produced ZERO rows without
 * erroring. This reads the page the way a person does instead, so a wording change
 * does not silently empty the output.
 *
 * It is a CHECKER, not an importer. Nothing here writes. It is called by
 * lib/requirements/posting-check.ts to compare a posting against the gates a human
 * already set, and a person decides what to accept. That shape was chosen after
 * measuring the alternative: across all nine open roles on 2026-08-30 the reader
 * agreed with the stored gates on 40 of 43 hour values and 91 boolean gates, so as
 * an importer it would mostly retype existing work. Its value was the three it
 * disagreed on — all three stored gates were wrong, on a live role with 31
 * applications against it.
 *
 * It is also wrong sometimes, which is the other reason a human stays in the loop:
 * on that same run it read "you will be part of our exciting Part 135 flight
 * department" as a Part 135 REQUIREMENT, when the sentence merely describes the
 * department. Treat every finding as a question, never an instruction.
 *
 * Every value comes back with the VERBATIM LINE it was read from, so a finding can
 * be judged without opening the posting — and so an accepted value can carry that
 * line as its evidence. The gates today store the WHOLE posting as evidenceText
 * (measured: 5 distinct strings across 70 gates, median 4,000 characters), which
 * cannot tell you which line justified a number.
 */

/** Overridable without a deploy, matching the other extractors in this directory. */
export const DEFAULT_MODEL = process.env.JOB_POST_READER_MODEL || "claude-opus-5";

/** Cap per posting. The longest real posting measured was 8,458 characters. */
const MAX_CHARS = 14000;

export type ReadHourMinimum = { key: string; value: number; evidence: string };
export type ReadBooleanRequirement = { key: string; required: boolean; evidence: string };
export type ReadUnmappable = { description: string; evidence: string; why_no_gate: string };

export type JobPostReading = {
  role_title: string;
  seat: string;
  aircraft: string[];
  hour_minimums: ReadHourMinimum[];
  boolean_requirements: ReadBooleanRequirement[];
  unmappable_requirements: ReadUnmappable[];
};

export type JobPostReadResult = {
  reading: JobPostReading | null;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
  error?: string;
};

const SYSTEM = `You read AVIATION JOB POSTINGS and return the hiring requirements they state, as structured data.

RULES

1. ONLY what the posting states. Never infer a requirement that is not written, and
   never carry over a typical value from other postings you have seen. A posting
   that omits a metric simply omits it.

2. EVERY value carries "evidence": the exact substring of the posting you read it
   from, copied verbatim, long enough for a human to verify without opening the
   document (roughly 30-120 characters).

3. HOUR MINIMUMS go in hour_minimums, using ONLY the catalog keys listed below. The
   value is the MINIMUM the posting requires. "Minimum 4,500 hours total flight
   time" is total_time = 4500. Round to whole numbers.

4. YES/NO REQUIREMENTS go in boolean_requirements, using ONLY the catalog keys
   listed below. required=true when the posting requires it, false when the posting
   says it is merely preferred.

5. DESCRIPTION IS NOT REQUIREMENT. A sentence describing the company or the
   department is not a requirement on the candidate. "You will be part of our Part
   135 flight department" describes where the job sits; it does NOT state that the
   candidate must arrive with Part 135 experience. Only record a requirement when
   the posting asks something OF THE APPLICANT.

6. THE IMPORTANT ONE - unmappable_requirements. If the posting states a real
   requirement that CANNOT be expressed by any catalog key above, put it here
   rather than forcing it into a key that nearly fits or dropping it silently.
   Say plainly in why_no_gate which part cannot be represented. Things that do not
   fit include: a geographic or domicile requirement, a conditional minimum
   ("X hours, or Y if Z"), a recency qualifier with no hour figure, a duty-day
   limit, or a physical requirement.

7. AIRCRAFT: list the types the posting names, as written.

8. SEAT: PIC, SIC, Lead PIC or Chief Pilot when the posting makes it clear.
   Return "Unknown" rather than guessing - a wrong seat is worse than no seat.

Return valid JSON only.`;

/**
 * Whether a model accepts output_config.effort. Same rule as
 * lib/extraction/pilot-metrics-llm.ts, which documents why it matters: the
 * 4.5-generation Haiku and Sonnet return a 400, and a caller that treats a failed
 * read as "no findings" would show an empty, reassuring result instead of an error.
 */
function supportsEffort(model: string): boolean {
  return !/haiku-4-5|sonnet-4-5/i.test(model);
}

function buildSchema(hourKeys: string[], booleanKeys: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["role_title", "seat", "aircraft", "hour_minimums", "boolean_requirements", "unmappable_requirements"],
    properties: {
      role_title: { type: "string" },
      seat: { type: "string", enum: ["PIC", "SIC", "Lead PIC", "Chief Pilot", "Unknown"] },
      aircraft: { type: "array", items: { type: "string" } },
      hour_minimums: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["key", "value", "evidence"],
          properties: {
            key: { type: "string", enum: hourKeys },
            value: { type: "number" },
            evidence: { type: "string" }
          }
        }
      },
      boolean_requirements: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["key", "required", "evidence"],
          properties: {
            key: { type: "string", enum: booleanKeys },
            required: { type: "boolean" },
            evidence: { type: "string" }
          }
        }
      },
      unmappable_requirements: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["description", "evidence", "why_no_gate"],
          properties: {
            description: { type: "string" },
            evidence: { type: "string" },
            why_no_gate: { type: "string" }
          }
        }
      }
    }
  };
}

export function buildJobPostRequest(
  text: string,
  hourKeys: string[],
  booleanKeys: string[],
  model: string = DEFAULT_MODEL
) {
  return {
    model,
    max_tokens: 4000,
    // The rules are byte-identical on every posting, so they are cached rather than
    // re-billed. A 1h TTL keeps the cache alive across a session of checks.
    system: [
      {
        type: "text" as const,
        text: `${SYSTEM}\n\nCATALOG HOUR KEYS:\n${hourKeys.join(", ")}\n\nCATALOG YES/NO KEYS:\n${booleanKeys.join(", ")}`,
        cache_control: { type: "ephemeral" as const, ttl: "1h" as const }
      }
    ],
    output_config: {
      ...(supportsEffort(model) ? { effort: "low" as const } : {}),
      format: { type: "json_schema" as const, schema: buildSchema(hourKeys, booleanKeys) }
    },
    messages: [{ role: "user" as const, content: `Job posting text:\n\n${text.slice(0, MAX_CHARS)}` }]
  };
}

/** Read one posting. Returns a null reading on any failure, with the reason. */
export async function readJobPost(
  text: string,
  hourKeys: string[],
  booleanKeys: string[],
  model: string = DEFAULT_MODEL
): Promise<JobPostReadResult> {
  const zero = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  if (!process.env.ANTHROPIC_API_KEY) {
    return { reading: null, usage: zero, error: "ANTHROPIC_API_KEY is not set." };
  }
  if (!text.trim()) {
    return { reading: null, usage: zero, error: "This requirement has no stored posting text to check against." };
  }
  if (!hourKeys.length || !booleanKeys.length) {
    // A schema enum cannot be empty, and an empty catalog would 400 confusingly.
    return { reading: null, usage: zero, error: "The requirement catalog is empty, so there is nothing to read against." };
  }

  const client = new Anthropic();
  try {
    const message = (await client.messages.create(
      buildJobPostRequest(text, hourKeys, booleanKeys, model) as never
    )) as Anthropic.Message;

    const raw = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    const u = message.usage as Anthropic.Usage & {
      cache_read_input_tokens?: number | null;
      cache_creation_input_tokens?: number | null;
    };

    return {
      reading: raw ? (JSON.parse(raw) as JobPostReading) : null,
      usage: {
        input: u.input_tokens,
        output: u.output_tokens,
        cacheRead: u.cache_read_input_tokens ?? 0,
        cacheWrite: u.cache_creation_input_tokens ?? 0
      }
    };
  } catch (error) {
    return { reading: null, usage: zero, error: error instanceof Error ? error.message : String(error) };
  }
}
