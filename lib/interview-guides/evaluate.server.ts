import Anthropic from "@anthropic-ai/sdk";
import { COMPANY_VALUES } from "@/lib/compliments/constants";
import { questionPlain } from "@/lib/interview-questions/rich";
import { storedToPlain } from "@/lib/richtext/stored";
import { ANSWER_STRENGTHS, STRENGTH_LABEL, isAnswerStrength, type AnswerStrength } from "@/lib/interview-guides/constants";
import { VALUE_KEYS, VALUE_NAME } from "@/lib/interview-guides/values";

// DRAFT answer evaluator for interview guides.
//
// Nov 16 2026, first version: he asked for the system to say whether the person
// answered and whether it was a strong answer ("Put it in there but you don't
// have to fine-tune it yet").
// Nov 16 2026, second version, his words: "look at the question, look at the
// answer, and then evaluate the values and how the answer was rated ... Does it
// answer anything? Should we be adding additional values?" and "I want it to
// learn ... when I change things over time".
//
// So for each answer it now returns:
//   - a rating: STRONG / ADEQUATE / WEAK / NOT_ANSWERED, with one sentence why;
//   - the core values the answer actually SHOWED: it may drop a value the
//     question was written for (the answer did not show it) and add others;
//     with one sentence why.
// And it is shown the interviewer's recent corrections of its earlier calls
// (lib/interview-guides/learning.server.ts) as examples to follow.
//
// Still a draft and not tuned. It judges the NOTES typed (or drafted from a
// transcript), not a recording. Anything the interviewer set by hand is never
// overwritten; the route decides what to apply.
//
// Nothing here writes; the route stores what comes back.

const MODEL = process.env.GUIDE_EVAL_MODEL || "claude-opus-5-5";

export type EvaluationInput = {
  id: string;
  text: string;
  strongAnswer: string;
  listenFor: string;
  /** The values the question was written for. */
  coreValues: string[];
  answer: string;
};

export type Lesson = {
  kind: string;
  questionText: string;
  answerText: string;
  askedJson: string | null;
  aiValue: string;
  humanValue: string;
};

export type Evaluation = { id: string; strength: AnswerStrength; note: string; values: string[]; valuesNote: string };

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
        required: ["id", "strength", "note", "values", "valuesNote"],
        properties: {
          id: { type: "string" },
          strength: { type: "string", enum: [...ANSWER_STRENGTHS] },
          note: { type: "string" },
          values: { type: "array", items: { type: "string", enum: [...VALUE_KEYS] } },
          valuesNote: { type: "string" }
        }
      }
    }
  }
} as const;

function systemPrompt(): string {
  const values = COMPANY_VALUES.map(
    (v) => `- ${v.colorKey} = ${v.name}: ${v.definition} Key behaviors: ${v.keyBehaviors.join(" ")}`
  ).join("\n");
  return [
    "You help a recruiter at SkyShare, a private aviation company, review an interview.",
    "For each question you get the question, the core values it was written to draw out, the company's notes on what a strong answer looks like and what to listen for, and the interviewer's notes of what the candidate said. The notes are often short and written quickly during the interview.",
    "",
    "Do two things for each answer.",
    "",
    "1. Rate the answer:",
    "- STRONG: answered the question asked, with a specific example or detail that matches what a strong answer looks like.",
    "- ADEQUATE: answered it, but in general terms, or missing an important part of what a strong answer covers.",
    "- WEAK: answered, but vague, off the point, or showing a concern the listen-for notes warn about.",
    "- NOT_ANSWERED: the notes show the candidate did not answer the question that was asked, or deflected.",
    "In note, one short plain sentence (under 25 words) saying why, pointing at what was or was not in the answer.",
    "",
    "2. Decide which of SkyShare's four core values the ANSWER actually showed, by what the candidate said or did, not by what the question was meant to draw out:",
    values,
    "Start from the values the question was written for, but leave one out if the answer did not show it, and add any other value the answer clearly showed. Only include a value with real evidence in the answer; an empty list is fine for a thin or off-topic answer. Use the keys above (for example customerFocus).",
    "In valuesNote, one short plain sentence (under 25 words) naming what in the answer showed each value you picked, and why any value the question was written for was left out.",
    "",
    "Judge only what the notes say; do not invent details, and do not judge the candidate as a person. Where a strong-answer note is missing, judge whether the answer is specific and relevant to the question.",
    "",
    "The recruiter has corrected some of your earlier calls. They are given as past corrections. Treat them as how this recruiter wants answers judged: follow the pattern they show when a new answer is similar.",
    "",
    "Return one evaluation per question id you were given, using the same ids."
  ].join("\n");
}

function lessonsBlock(lessons: Lesson[]): string {
  if (lessons.length === 0) return "";
  const fmtValues = (json: string) => {
    try {
      const arr = JSON.parse(json) as string[];
      return arr.length ? arr.map((k) => VALUE_NAME[k] ?? k).join(", ") : "none";
    } catch {
      return json;
    }
  };
  const fmtStrength = (s: string) => (isAnswerStrength(s) ? STRENGTH_LABEL[s] : "no rating");
  const rows = lessons.map((l, i) => {
    const asked = l.askedJson ? fmtValues(l.askedJson) : "none";
    const what =
      l.kind === "VALUES"
        ? `You said the answer showed: ${fmtValues(l.aiValue)}. The recruiter changed it to: ${fmtValues(l.humanValue)}.`
        : `You rated it ${fmtStrength(l.aiValue)}. The recruiter changed it to ${fmtStrength(l.humanValue)}.`;
    return [`<correction n="${i + 1}">`, `Question: ${l.questionText}`, `Written for: ${asked}`, `Answer notes: ${l.answerText}`, what, "</correction>"].join("\n");
  });
  return `<past_corrections>\n${rows.join("\n\n")}\n</past_corrections>\n\n`;
}

export function isEvaluationConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Judge the answered questions. Throws with a readable message on failure. */
export async function evaluateAnswers(items: EvaluationInput[], lessons: Lesson[] = []): Promise<Evaluation[]> {
  if (items.length === 0) return [];
  if (!isEvaluationConfigured()) throw new Error("Evaluating answers needs the Anthropic key, which is not set on this server.");

  const body = items
    .map((it) =>
      [
        `<question id="${it.id}">`,
        `Question: ${questionPlain(it.text)}`,
        `Written for: ${it.coreValues.length ? it.coreValues.map((v) => `${VALUE_NAME[v] ?? v} (${v})`).join(", ") : "no particular value"}`,
        `Strong answer looks like: ${storedToPlain(it.strongAnswer) || "(no note)"}`,
        `Listen for: ${storedToPlain(it.listenFor) || "(no note)"}`,
        `Interviewer's notes of the answer: ${storedToPlain(it.answer)}`,
        "</question>"
      ].join("\n")
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
    messages: [{ role: "user", content: `${lessonsBlock(lessons)}Here are the questions and answers to judge.\n\n${body}` }]
  });
  const response = await stream.finalMessage();

  if (response.stop_reason === "refusal") throw new Error("The answers could not be evaluated (the model declined).");
  if (response.stop_reason === "max_tokens") throw new Error("Too many answers to evaluate in one go.");
  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  if (!text.trim()) throw new Error("Nothing came back from the evaluation.");
  const parsed = JSON.parse(text) as {
    evaluations?: Array<{ id?: string; strength?: string; note?: string; values?: string[]; valuesNote?: string }>;
  };
  const wanted = new Set(items.map((i) => i.id));
  return (parsed.evaluations ?? [])
    .filter((e) => typeof e.id === "string" && wanted.has(e.id) && isAnswerStrength(e.strength))
    .map((e) => ({
      id: e.id as string,
      strength: e.strength as AnswerStrength,
      note: (e.note ?? "").trim().slice(0, 1000),
      values: VALUE_KEYS.filter((k) => (e.values ?? []).includes(k)),
      valuesNote: (e.valuesNote ?? "").trim().slice(0, 1000)
    }));
}
