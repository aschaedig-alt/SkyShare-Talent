import Anthropic from "@anthropic-ai/sdk";
import { strFromU8, unzipSync } from "fflate";
import { COMPANY_VALUES } from "@/lib/compliments/constants";
import { DEPARTMENTS } from "@/lib/calendar/departments";
import { CORE_VALUE_KEYS, QUESTION_CATEGORIES, QUESTION_DEPARTMENTS } from "@/lib/validation/interview-question";

// Read a document of interview questions and split it into the bank's fields —
// feedback cmwcmsbwn (Nov 11 2026): "i would like to be able to upload a document
// of questions with the fields listed and you autofill them".
//
// Nothing here writes. The route returns what was read as a PREVIEW; questions
// are only created when somebody presses Add on the reviewed list.
//
// Formats: .docx (unzipped here with fflate; Claude does not read Word files),
// .pdf (sent to Claude as a document, so scanned and laid-out PDFs work), and
// plain text — which also covers pasting from a Google Doc.

const MODEL = process.env.QUESTION_IMPORT_MODEL || "claude-opus-5-5";

export type ImportedQuestion = {
  text: string;
  category: (typeof QUESTION_CATEGORIES)[number];
  coreValues: Array<(typeof CORE_VALUE_KEYS)[number]>;
  departments: Array<(typeof QUESTION_DEPARTMENTS)[number]>;
  strongAnswer: string;
  listenFor: string;
};

export type ImportSource = { kind: "text"; text: string } | { kind: "pdf"; base64: string };

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

/** The text of a .docx, one line per paragraph (table cells included). */
export function docxToText(bytes: Uint8Array): string {
  const files = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
  const xml = files["word/document.xml"];
  if (!xml) throw new Error("That file is not a Word document (.docx).");
  const body = strFromU8(xml);
  return body
    .split(/<\/w:p>/)
    .map((para) =>
      decodeXml(
        para
          .replace(/<w:tab\/>/g, "\t")
          .replace(/<w:br\/>/g, "\n")
          .replace(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g, "\u0000$1\u0000")
          .split("\u0000")
          .filter((_part, i) => i % 2 === 1)
          .join("")
      )
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "category", "coreValues", "departments", "strongAnswer", "listenFor"],
        properties: {
          text: { type: "string" },
          category: { type: "string", enum: [...QUESTION_CATEGORIES] },
          coreValues: { type: "array", items: { type: "string", enum: [...CORE_VALUE_KEYS] } },
          departments: { type: "array", items: { type: "string", enum: [...QUESTION_DEPARTMENTS] } },
          strongAnswer: { type: "string" },
          listenFor: { type: "string" }
        }
      }
    }
  }
} as const;

function systemPrompt(): string {
  const values = COMPANY_VALUES.map((v) => `- ${v.colorKey}: ${v.name} — ${v.description}`).join("\n");
  const depts = DEPARTMENTS.map((d) => `- ${d.key}: ${d.label}`).join("\n");
  return [
    "You read a document of interview questions for SkyShare, a private aviation company, and return each question as structured fields for its question bank.",
    "",
    "Copy the document's wording exactly. Do not rewrite, shorten, correct or add to any question or note. Keep line breaks between paragraphs as blank lines (\\n\\n) and keep bullet points as lines starting with \"- \".",
    "",
    "Fields:",
    "- text: the question itself, as the interviewer would ask it.",
    "- strongAnswer: what a strong answer looks like or sounds like (often labelled Strong answer, Example answer, Good answer). Empty string if the document gives none.",
    "- listenFor: what the interviewer should listen for (often labelled Listen for, Look for, Red flags, Follow-up, Purpose). Put follow-up questions and purpose notes here too. Empty string if none.",
    `- category: one of ${QUESTION_CATEGORIES.join(", ")}. Use the document's own category when it gives one; otherwise BEHAVIORAL for "tell me about a time", SITUATIONAL for "what would you do", TECHNICAL for job knowledge, EXPERIENCE for background, CULTURE for motivation and values, GENERAL for disclosures and logistics, OTHER when none fit.`,
    "- coreValues: the company core values the document tags the question with, or that the question clearly targets. Use these keys:",
    values,
    "  An empty list is fine when the question is not about a value.",
    "- departments: only if the document says which departments the question is for, using these keys; otherwise an empty list (meaning all departments):",
    depts,
    "",
    "Return every question in the document, in the order it appears. Headings, instructions and introductions are not questions. If the document has no interview questions, return an empty list."
  ].join("\n");
}

function clean(q: Partial<ImportedQuestion>): ImportedQuestion | null {
  const text = (q.text ?? "").trim();
  if (text.length < 5) return null;
  return {
    text,
    category: QUESTION_CATEGORIES.includes(q.category as ImportedQuestion["category"]) ? (q.category as ImportedQuestion["category"]) : "OTHER",
    coreValues: [...new Set((q.coreValues ?? []).filter((v): v is ImportedQuestion["coreValues"][number] => (CORE_VALUE_KEYS as readonly string[]).includes(v)))],
    departments: [...new Set((q.departments ?? []).filter((d): d is ImportedQuestion["departments"][number] => (QUESTION_DEPARTMENTS as readonly string[]).includes(d)))],
    strongAnswer: (q.strongAnswer ?? "").trim(),
    listenFor: (q.listenFor ?? "").trim()
  };
}

export function isImportConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Ask Claude to split the document into questions. Throws with a readable message on failure. */
export async function extractQuestions(source: ImportSource): Promise<ImportedQuestion[]> {
  if (!isImportConfigured()) throw new Error("Reading documents needs the Anthropic key, which is not set on this server.");
  const client = new Anthropic();
  const content: Anthropic.Beta.BetaContentBlockParam[] =
    source.kind === "pdf"
      ? [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: source.base64 } },
          { type: "text", text: "Here is the document. Return its interview questions." }
        ]
      : [{ type: "text", text: `Here is the document. Return its interview questions.\n\n<document>\n${source.text}\n</document>` }];

  // Streaming: a long question doc produces a long answer, and a non-streamed
  // request that size can hit the HTTP timeout.
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    betas: ["server-side-fallback-2026-07-01"],
    // If this model declines, the API retries on its own fallback choice.
    fallbacks: [{ model: "claude-opus-4-8" }],
    system: systemPrompt(),
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content }]
  });
  const response = await stream.finalMessage();

  if (response.stop_reason === "refusal") throw new Error("The document could not be read (the model declined it).");
  if (response.stop_reason === "max_tokens") throw new Error("That document is too long to read in one go. Split it into smaller files.");
  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  if (!text.trim()) throw new Error("Nothing came back from reading the document.");
  const parsed = JSON.parse(text) as { questions?: Array<Partial<ImportedQuestion>> };
  return (parsed.questions ?? []).map(clean).filter((q): q is ImportedQuestion => q !== null);
}
