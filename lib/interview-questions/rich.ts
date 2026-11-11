// Question-bank text and core values — shared by the bank, the guide builder,
// the API and the interview scorecard.
//
// PURE module (no Prisma / no server-only imports) — client components import it.
//
// RICH TEXT (feedback cmwcjtm5k, Nov 11 2026): question text and "what a strong
// answer looks like" used to be plain textareas rendered into a <p>, so a blank
// line between two paragraphs vanished on save. They now use the same editor as
// candidate notes and are stored as sanitized HTML. Questions saved before that
// are plain text; questionHtml() reads both, so nothing has to be rewritten in
// the shared database.
//
// MULTIPLE CORE VALUES (same feedback): a question can fit more than one value.
// They are stored comma-separated in the EXISTING coreValue column
// ("teamwork,integrity") rather than in a new column, so no migration — a
// single legacy value is simply a list of one.

import { plainTextToHtml } from "@/lib/richtext/normalize";
import { richTextToPlain } from "@/lib/richtext/sanitize";

/** Has this stored value been written by the rich editor (or is it legacy plain text)? */
export function isRichHtml(stored: string | null | undefined): boolean {
  return Boolean(stored && /<\/?(p|br|strong|b|em|i|u|s|ul|ol|li|h3|blockquote|span|a)\b[^>]*>/i.test(stored));
}

/** Stored question text as HTML for the editor and for RichTextView. */
export function questionHtml(stored: string | null | undefined): string {
  if (!stored) return "";
  return isRichHtml(stored) ? stored : plainTextToHtml(stored);
}

/** Stored question text as plain text — for search, copying a guide, and scorecard items. */
export function questionPlain(stored: string | null | undefined): string {
  if (!stored) return "";
  return isRichHtml(stored) ? richTextToPlain(stored) : stored.trim();
}

/**
 * The interviewer guidance under a question, as TWO blocks — "Strong answer" and
 * "Listen for" (asked for Nov 11 2026, alongside feedback cmwcjtm5k). Both are
 * rich-text HTML.
 *
 * Stored together in the EXISTING guidance column as a small JSON envelope, so
 * no migration against the shared live database. Guidance saved before the
 * split is plain text written as "Strong answer: ..." optionally followed by a
 * "Listen for: ..." paragraph; parseGuidance splits that at READ time and drops
 * the two prefixes (they are now the blocks' labels), so the existing questions
 * show correctly without any data being rewritten. They move to the envelope
 * the next time somebody saves them.
 */
export type Guidance = { strongAnswer: string; listenFor: string };

const ENVELOPE_KEY = "strongAnswer";

export function parseGuidance(stored: string | null | undefined): Guidance {
  const empty = { strongAnswer: "", listenFor: "" };
  if (!stored || !stored.trim()) return empty;
  const trimmed = stored.trim();
  if (trimmed.startsWith("{") && trimmed.includes(`"${ENVELOPE_KEY}"`)) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<Guidance>;
      return {
        strongAnswer: typeof parsed.strongAnswer === "string" ? parsed.strongAnswer : "",
        listenFor: typeof parsed.listenFor === "string" ? parsed.listenFor : ""
      };
    } catch {
      /* not an envelope after all — fall through and treat it as text */
    }
  }
  if (isRichHtml(trimmed)) return { strongAnswer: trimmed, listenFor: "" };
  // Legacy plain text.
  const [strong, ...rest] = trimmed.split(/\n\s*listen for:\s*/i);
  const strongText = strong.replace(/^\s*strong answer:\s*/i, "").trim();
  const listenText = rest.join("\n").trim();
  return {
    strongAnswer: strongText ? plainTextToHtml(strongText) : "",
    listenFor: listenText ? plainTextToHtml(listenText) : ""
  };
}

/** The envelope to store, or null when both blocks are empty. Sanitize the HTML BEFORE calling this. */
export function serializeGuidance(g: Guidance): string | null {
  const strongAnswer = questionPlain(g.strongAnswer) ? g.strongAnswer : "";
  const listenFor = questionPlain(g.listenFor) ? g.listenFor : "";
  if (!strongAnswer && !listenFor) return null;
  return JSON.stringify({ strongAnswer, listenFor });
}

export function parseCoreValues(stored: string | null | undefined): string[] {
  if (!stored) return [];
  return [...new Set(stored.split(",").map((v) => v.trim()).filter(Boolean))];
}

export function joinCoreValues(values: readonly string[] | null | undefined): string | null {
  const list = [...new Set((values ?? []).map((v) => v.trim()).filter(Boolean))];
  return list.length ? list.join(",") : null;
}
