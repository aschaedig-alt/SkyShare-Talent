import Anthropic from "@anthropic-ai/sdk";

/**
 * Pull structured fields out of a candidate's Paycom application PDF text.
 *
 * The Paycom application carries the candidate's Paycom PERSON id (a short digit
 * code in the header, e.g. "Aircraft Maintenance Apprentice - 320080 Application")
 * — the exact key the Paycom→Front automation needs — plus the usual identity /
 * contact fields. This uses the same Anthropic SDK integration as the candidate AI
 * summary (lib/archive/ai-summary.ts): reads ANTHROPIC_API_KEY, small model for
 * cost. Values are only ever used to fill BLANK candidate fields for review — never
 * to overwrite something already entered.
 */

const MODEL = process.env.PAYCOM_EXTRACT_MODEL || "claude-haiku-4-5";

export type PaycomExtract = {
  paycomPersonId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
};

const EMPTY: PaycomExtract = { paycomPersonId: null, firstName: null, lastName: null, email: null, phone: null };

export function isPaycomExtractConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// A candidate document is a Paycom application if its name says so, or (fallback)
// its text is clearly a Paycom form. Filename is the reliable signal in practice
// ("Paycom Application_ Jane Doe.pdf").
export function looksLikePaycomApplication(filename: string | null | undefined, text: string): boolean {
  if ((filename ?? "").toLowerCase().includes("paycom")) return true;
  return /\bpaycom\b/i.test(text.slice(0, 3000));
}

const SYSTEM =
  "You extract structured fields from the plain text of a Paycom job-application PDF. " +
  "Return ONLY a JSON object with exactly these keys: paycomPersonId, firstName, lastName, email, phone. " +
  "paycomPersonId is the applicant's Paycom person / employee number — a short run of digits (usually 6) " +
  "shown in the application header; return digits only. " +
  "Use null for any field you cannot find with high confidence. Never guess or invent a value. " +
  "Output the JSON object only — no prose, no markdown, no code fences.";

// Parse the model's reply into a PaycomExtract. Exported so the parsing can be
// unit-tested without a live API call. Tolerant of stray prose / code fences.
export function parsePaycomExtract(raw: string): PaycomExtract {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return EMPTY;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return EMPTY;
  }
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const rawId = str(obj.paycomPersonId);
  const digits = rawId ? rawId.replace(/\D/g, "") : "";
  return {
    // Only accept a plausible Paycom id shape (4-8 digits) to keep junk out.
    paycomPersonId: /^\d{4,8}$/.test(digits) ? digits : null,
    firstName: str(obj.firstName),
    lastName: str(obj.lastName),
    email: str(obj.email),
    phone: str(obj.phone)
  };
}

// Deterministic extraction from the SKYSHARE Paycom application template, which
// carries clearly-labelled fields:
//   "Application ID ######"  ·  "Email Address …"  ·  "Name Last, First Middle"
//   ·  "Primary Phone …"
// This is the PRIMARY path and needs no API key — the LLM below is only a fallback
// for fields the template regex can't find (a non-standard layout).
export function extractPaycomRegex(text: string): PaycomExtract {
  const t = text.replace(/\s+/g, " ");
  const idRaw = t.match(/Application\s*ID[\s:]*?(\d{4,8})/i)?.[1] ?? "";
  const email = t.match(/Email\s*Address[\s:]*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i)?.[1] ?? null;
  const phoneRaw = t.match(/Primary\s*Phone[\s:]*(\+?\d[\d()\s.\-]{6,}\d)/i)?.[1] ?? null;
  // "Name Last, First Middle" — the comma tells it apart from First/Last Name fields.
  const nameM = t.match(/\bName\s+([A-Z][A-Za-z'’.\-]+),\s*([A-Z][A-Za-z'’.\-]+)/);
  return {
    paycomPersonId: /^\d{4,8}$/.test(idRaw) ? idRaw : null,
    firstName: nameM?.[2] ?? null,
    lastName: nameM?.[1] ?? null,
    email,
    phone: phoneRaw ? phoneRaw.trim() : null
  };
}

// Merge two extracts, preferring the first (the deterministic regex) per field.
export function mergePaycomExtract(primary: PaycomExtract, fallback: PaycomExtract): PaycomExtract {
  return {
    paycomPersonId: primary.paycomPersonId ?? fallback.paycomPersonId,
    firstName: primary.firstName ?? fallback.firstName,
    lastName: primary.lastName ?? fallback.lastName,
    email: primary.email ?? fallback.email,
    phone: primary.phone ?? fallback.phone
  };
}

export async function extractPaycomApplication(text: string): Promise<PaycomExtract> {
  if (!process.env.ANTHROPIC_API_KEY) return EMPTY;
  const client = new Anthropic();
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: SYSTEM,
    // Cap the input — the fields we want are all near the top of the form.
    messages: [{ role: "user", content: `Application text:\n\n${text.slice(0, 12000)}` }]
  });
  const raw = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  return parsePaycomExtract(raw);
}
