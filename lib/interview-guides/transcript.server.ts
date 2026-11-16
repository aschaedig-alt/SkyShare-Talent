import Anthropic from "@anthropic-ai/sdk";
import { questionPlain } from "@/lib/interview-questions/rich";
import { RICH_NOTE_MAX_CHARS } from "@/lib/richtext/stored";

// "Fill from transcript" for interview guides - asked for Nov 16 2026:
// "I can paste in the entire transcript of the conversation, and you can fill in
// the answers to each question. I don't want to type it in with my shorthand...
// a full answer... like the conversation goes, correcting any grammatical errors."
//
// Her three calls, same day:
//   - VOICE: the candidate's own, first person, cleaned up ("I pulled the student
//     aside..."), not a summary about them.
//   - PREVIEW: nothing saves from here. This returns drafts; she approves each one
//     (or all) on the guide before anything is written, and an answer she already
//     typed is only replaced when she says so.
//   - NOT ASKED: a question that was never asked comes back empty, so the box stays
//     blank and the evaluator skips it.
//
// It also leaves out personal and family details and past pay, the same rule the
// Granola interview template carries, so a cleaned-up answer never puts them into
// the record.
//
// Nothing here writes; the route returns what comes back.

const MODEL = process.env.GUIDE_TRANSCRIPT_MODEL || "claude-opus-5-5";

/** Longest transcript accepted. A long interview runs ~60k characters. */
export const TRANSCRIPT_MAX_CHARS = 200_000;

/** Room left under the answer box's limit, so a drafted answer always saves. */
const ANSWER_MAX_CHARS = RICH_NOTE_MAX_CHARS - 300;

export type TranscriptQuestion = { id: string; text: string };

/** One question's draft. answer is plain text with blank lines between paragraphs; "" when it was not asked. */
export type TranscriptDraft = { id: string; asked: boolean; answer: string };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["drafts"],
  properties: {
    drafts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "asked", "answer"],
        properties: {
          id: { type: "string" },
          asked: { type: "boolean" },
          answer: { type: "string" }
        }
      }
    }
  }
} as const;

function systemPrompt(): string {
  return [
    "You help a recruiter at SkyShare, a private aviation company, write up an interview from its transcript.",
    "You get a numbered list of interview questions and the full transcript of the conversation. The transcript may label speakers as Me/Them, Speaker A/B, names, or not at all; the recruiter is the one asking the questions.",
    "",
    "For EACH question, find where it was asked (the wording may differ; match on meaning) and write the candidate's answer.",
    "",
    "HOW TO WRITE THE ANSWER",
    "- In the candidate's own voice, first person, as they said it: \"I pulled the student aside and asked what happened...\". Not a summary about them.",
    "- Fix grammar and remove filler (um, like, you know), false starts and repeated words, so it reads as clear, complete sentences.",
    "- Keep their meaning, their specific examples, names of aircraft and places, numbers and outcomes. Do not shorten it into notes.",
    "- Include their answers to the recruiter's follow-up questions on the same topic, woven in where they belong.",
    "- NEVER add anything they did not say, and never improve the substance of the answer. Cleaning the language is fine; making the answer sound better than it was is not.",
    "- Leave out personal and family details even if they mention them (marriage, spouse, children, family plans, health, age, religion, nationality) and anything about their past or current pay.",
    "- Separate paragraphs with a blank line. Plain text only: no markdown, bullets or headings.",
    `- Keep each answer under ${ANSWER_MAX_CHARS} characters.`,
    "",
    "IF A QUESTION WAS NOT ASKED",
    "- Set asked to false and answer to an empty string. Do not fill it from something they said elsewhere.",
    "- If it was asked but the candidate did not really answer, set asked to true and write what they did say.",
    "",
    "Return one draft per question id you were given, using the same ids."
  ].join("\n");
}

export function isTranscriptFillConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Draft every question's answer from a transcript. Throws with a readable message on failure. */
export async function draftAnswersFromTranscript(questions: TranscriptQuestion[], transcript: string): Promise<TranscriptDraft[]> {
  if (questions.length === 0) return [];
  if (!isTranscriptFillConfigured()) throw new Error("Filling from a transcript needs the Anthropic key, which is not set on this server.");

  const list = questions.map((q, i) => `<question id="${q.id}" number="${i + 1}">${questionPlain(q.text)}</question>`).join("\n");

  const client = new Anthropic();
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    // If this model declines, the API retries on its own fallback choice.
    fallbacks: [{ model: "claude-opus-4-8" }],
    system: systemPrompt(),
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    messages: [
      {
        role: "user",
        content: `<questions>\n${list}\n</questions>\n\n<transcript>\n${transcript}\n</transcript>`
      }
    ]
  });
  const response = await stream.finalMessage();

  if (response.stop_reason === "refusal") throw new Error("The transcript could not be read (the model declined).");
  if (response.stop_reason === "max_tokens") throw new Error("The answers ran too long to draft in one go. Try a guide with fewer questions.");
  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  if (!text.trim()) throw new Error("Nothing came back from the transcript.");
  const parsed = JSON.parse(text) as { drafts?: Array<{ id?: unknown; asked?: unknown; answer?: unknown }> };

  const wanted = new Set(questions.map((q) => q.id));
  const byId = new Map<string, TranscriptDraft>();
  for (const d of parsed.drafts ?? []) {
    if (typeof d.id !== "string" || !wanted.has(d.id) || byId.has(d.id)) continue;
    const answer = typeof d.answer === "string" ? d.answer.trim().slice(0, ANSWER_MAX_CHARS) : "";
    byId.set(d.id, { id: d.id, asked: d.asked === true && answer.length > 0, answer: d.asked === true ? answer : "" });
  }
  // Every question comes back, in guide order; one the model skipped reads as not asked.
  return questions.map((q) => byId.get(q.id) ?? { id: q.id, asked: false, answer: "" });
}
