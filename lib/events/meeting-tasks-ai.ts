import Anthropic from "@anthropic-ai/sdk";
import { startOfOfficeDay } from "@/lib/dates/display";

/**
 * Pull the action items out of a planning-meeting transcript (Nov 24 2026, built
 * for the Christmas party planning meetings, which Granola does not record — the
 * transcripts are uploaded by hand).
 *
 * READ-ONLY. This returns suggestions; nothing is written until a person has
 * reviewed the list and saved it (app/api/events/[id]/meetings POST).
 *
 * Ownership is the hard part, so the prompt is strict about it: an item gets an
 * owner only when the transcript shows that person taking it on or being handed
 * it. Raising an idea is not owning it, and a shared topic does not assign every
 * action to everyone in it. Unclear stays null and the reviewer fills it in.
 */

const MEETING_TASKS_MODEL = process.env.MEETING_TASKS_MODEL || "claude-opus-5-5";

/** Plenty for a long meeting; beyond this the tail is dropped and the UI says so. */
export const MAX_TRANSCRIPT_CHARS = 250_000;

const SYSTEM_PROMPT = [
  "You read the transcript of a company event-planning meeting and list the ACTION ITEMS:",
  "concrete things somebody is going to do before the event.",
  "",
  "Rules:",
  "- Only include real commitments or assignments: someone says they will do it, or is asked to and",
  "  accepts, or the group clearly decides a named person will. Do not list ideas that were floated",
  "  and dropped, general discussion, or things that are already finished.",
  "- owner: the person responsible, ONLY when the transcript makes it clear. Someone raising an",
  "  issue does not make them its owner. If it is unclear, owner is null - a null is far better",
  "  than a guess. If several people share it, name them joined by ' & '.",
  "- When the owner matches exactly one name in the KNOWN PEOPLE list (for example a first name",
  "  that only one listed person has), use that full name. Otherwise use the name as spoken.",
  "- dueDate: yyyy-mm-dd, only when a date or deadline was actually said. Resolve relative dates",
  "  ('by Friday', 'next week', 'the day before the party') against the MEETING DATE and EVENT",
  "  DATE given. No deadline said = null.",
  "- label: a short imperative to-do, under 90 characters ('Book the DJ', 'Order 200 ornaments').",
  "- notes: one or two short lines of useful detail said about it (quantities, vendor, budget,",
  "  who to call). null if there is nothing worth keeping.",
  "- evidence: a SHORT paraphrase of where in the meeting this came from, so a reviewer can find it.",
  "- status: IN_PROGRESS if the transcript says it is already underway, BLOCKED if it is waiting",
  "  on something or someone, otherwise TODO.",
  "- Merge duplicates: one item per piece of work, even if it came up several times.",
].join("\n");

const NULLABLE_STRING = { anyOf: [{ type: "string" }, { type: "null" }] } as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          owner: NULLABLE_STRING,
          dueDate: NULLABLE_STRING,
          status: { type: "string", enum: ["TODO", "IN_PROGRESS", "BLOCKED"] },
          notes: NULLABLE_STRING,
          evidence: { type: "string" }
        },
        required: ["label", "owner", "dueDate", "status", "notes", "evidence"]
      }
    }
  },
  required: ["summary", "items"]
} as const;

export type ProposedTask = {
  label: string;
  owner: string | null;
  /** ISO instant at midnight Mountain, or null. */
  dueAt: string | null;
  status: "TODO" | "IN_PROGRESS" | "BLOCKED";
  notes: string | null;
  evidence: string;
};

export type MeetingExtraction =
  | { ok: true; summary: string; items: ProposedTask[]; truncated: boolean }
  | { ok: false; message: string };

const str = (v: unknown) => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t && t.toLowerCase() !== "null" ? t : null;
};

function toInstant(v: unknown): string | null {
  const day = str(v);
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return startOfOfficeDay(day)?.toISOString() ?? null;
}

export function isMeetingExtractionConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function extractMeetingTasks(input: {
  transcript: string;
  eventName: string;
  eventDate: string; // yyyy-mm-dd
  meetingDate: string | null; // yyyy-mm-dd
  meetingTitle: string;
  knownPeople: string[];
}): Promise<MeetingExtraction> {
  if (!isMeetingExtractionConfigured()) {
    return { ok: false, message: "The AI reader is not set up on this server (no ANTHROPIC_API_KEY)." };
  }
  const text = input.transcript.trim();
  if (!text) return { ok: false, message: "The transcript is empty." };
  const truncated = text.length > MAX_TRANSCRIPT_CHARS;

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MEETING_TASKS_MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: SCHEMA }
      },
      messages: [
        {
          role: "user",
          content: [
            `EVENT: ${input.eventName}`,
            `EVENT DATE: ${input.eventDate}`,
            `MEETING: ${input.meetingTitle}`,
            `MEETING DATE: ${input.meetingDate ?? "unknown"}`,
            `KNOWN PEOPLE: ${input.knownPeople.slice(0, 600).join("; ")}`,
            "",
            "TRANSCRIPT:",
            text.slice(0, MAX_TRANSCRIPT_CHARS)
          ].join("\n")
        }
      ]
    });

    if (response.stop_reason === "refusal") {
      return { ok: false, message: "The AI reader declined this transcript." };
    }
    if (response.stop_reason === "max_tokens") {
      return { ok: false, message: "The transcript produced more items than fit in one read. Try splitting it in two." };
    }
    const raw = response.content.find((b) => b.type === "text")?.text ?? "";
    const parsed = JSON.parse(raw) as { summary?: unknown; items?: unknown };
    const items = Array.isArray(parsed.items) ? parsed.items : [];

    return {
      ok: true,
      truncated,
      summary: str(parsed.summary) ?? "",
      items: items
        .map((entry) => {
          const e = entry as Record<string, unknown>;
          const label = str(e.label);
          if (!label) return null;
          const status = e.status === "IN_PROGRESS" || e.status === "BLOCKED" ? e.status : "TODO";
          return {
            label: label.slice(0, 200),
            owner: str(e.owner),
            dueAt: toInstant(e.dueDate),
            status,
            notes: str(e.notes),
            evidence: str(e.evidence) ?? ""
          } satisfies ProposedTask;
        })
        .filter((item): item is ProposedTask => item !== null)
    };
  } catch (error) {
    console.error("Meeting task extraction failed:", error);
    return { ok: false, message: "The AI reader could not process that transcript. Try again in a minute." };
  }
}
