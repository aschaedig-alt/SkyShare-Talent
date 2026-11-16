import Anthropic from "@anthropic-ai/sdk";
import { COMPANY_VALUES } from "@/lib/compliments/constants";
import { questionPlain } from "@/lib/interview-questions/rich";
import { storedToPlain } from "@/lib/richtext/stored";
import { ANSWER_STRENGTHS, isAnswerStrength, type AnswerStrength } from "@/lib/interview-guides/constants";

// DRAFT answer judge for interview guides — Nov 16 2026. He asked for the system
// to say whether the person answered and whether it was a strong answer, and
// said explicitly: "Put it in there but you don't have to fine-tune it yet."
//
// So this is deliberately simple and NOT tuned:
//   - it reads each question, the bank's Strong answer and Listen for notes, and
//     the interviewer's note of what the candidate said;
//   - it returns one of STRONG / ADEQUATE / WEAK / NOT_ANSWERED and one sentence;
//   - its judgement is a suggestion shown beside the answer. The interviewer can
//     override it, and a hand-set judgement is never overwritten by this.
// It judges the NOTES the interviewer typed, not a recording, so a short note can
// read as a weak answer that was not. That is a known limit, stated on the page.
//
// Nothing here writes; the route stores what comes back.

const MODEL = process.env.GUIDE_EVAL_MODEL || "claude-opus-5-5";

export type EvaluationInput = {
  id: string;
  text: string;
  strongAnswer: string;
  listenFor: string;
  coreValues: string[];
  answer: string;
};

export type Evaluation = { id: string; strength: AnswerStrength; note: string };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["evaluations"],
  properties: {
    evaluations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "strength", "note"],
        properties: {
          id: { type: "string" },
          strength: { type: "string", enum: [...ANSWER_STRENGTHS] },
          note: { type: "string" }
        }
      }
    }
  }
} as const;

function systemPrompt(): string {
  const values = COMPANY_VALUES.map((v) => `- ${v.name}: ${v.definition}`).join("\n");
  return [
    "You help a recruiter at SkyShare, a private aviation company, review an interview.",
    "For each question you get the question, the company's notes on what a strong answer looks like and what to listen for, and the interviewer's notes of what the candidate said. The notes are often short and written quickly during the interview.",
    "",
    "Judge each answer on one of these:",
    "- STRONG: answered the question asked, with a specific example or detail that matches what a strong answer looks like.",
    "- ADEQUATE: answered it, but in general terms, or missing an important part of what a strong answer covers.",
    "- WEAK: answered, but vague, off the point, or showing a concern the listen-for notes warn about.",
    "- NOT_ANSWERED: the notes show the candidate did not answer the question that was asked, or deflected.",
    "",
    "Write one short plain sentence (under 25 words) saying why, pointing at what was or was not in the answer. Judge only what the notes say; do not invent details, and do not judge the candidate as a person.",
    "Where a strong-answer note is missing, judge whether the answer is specific and relevant to the question.",
    "",
    "SkyShare's core values, for questions tagged with one:",
    values,
    "",
    "Return one evaluation per question id you were given, using the same ids."
  ].join("\n");
}

export function isEvaluationConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const VALUE_NAME: Record<string, string> = Object.fromEntries(COMPANY_VALUES.map((v) => [v.colorKey, v.name]));

/** Judge the answered questions. Throws with a readable message on failure. */
export async function evaluateAnswers(items: EvaluationInput[]): Promise<Evaluation[]> {
  if (items.length === 0) return [];
  if (!isEvaluationConfigured()) throw new Error("Evaluating answers needs the Anthropic key, which is not set on this server.");

  const body = items
    .map((it) =>
      [
        `<question id="${it.id}">`,
        `Question: ${questionPlain(it.text)}`,
        it.coreValues.length ? `Core values: ${it.coreValues.map((v) => VALUE_NAME[v] ?? v).join(", ")}` : null,
        `Strong answer looks like: ${storedToPlain(it.strongAnswer) || "(no note)"}`,
        `Listen for: ${storedToPlain(it.listenFor) || "(no note)"}`,
        `Interviewer's notes of the answer: ${storedToPlain(it.answer)}`,
        "</question>"
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");

  const client = new Anthropic();
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    // If this model declines, the API retries on its own fallback choice.
    fallbacks: [{ model: "claude-opus-4-8" }],
    system: systemPrompt(),
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: `Here are the questions and answers.\n\n${body}` }]
  });
  const response = await stream.finalMessage();

  if (response.stop_reason === "refusal") throw new Error("The answers could not be evaluated (the model declined).");
  if (response.stop_reason === "max_tokens") throw new Error("Too many answers to evaluate in one go.");
  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  if (!text.trim()) throw new Error("Nothing came back from the evaluation.");
  const parsed = JSON.parse(text) as { evaluations?: Array<{ id?: string; strength?: string; note?: string }> };
  const wanted = new Set(items.map((i) => i.id));
  return (parsed.evaluations ?? [])
    .filter((e): e is { id: string; strength: AnswerStrength; note?: string } => typeof e.id === "string" && wanted.has(e.id) && isAnswerStrength(e.strength))
    .map((e) => ({ id: e.id, strength: e.strength, note: (e.note ?? "").trim().slice(0, 1000) }));
}
