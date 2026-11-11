// Free-text columns that USED to be plain textareas and are now written by the
// rich editor (components/richtext/RichTextEditor.tsx).
//
// Aimee's feedback cmwcjtm5k (Nov 11 2026): "normal text editing like in the
// notes section with bold and italics" sitewide, and blank lines between
// paragraphs that survive a save. The question bank went first
// (lib/interview-questions/rich.ts); this is the same rule for every other
// converted box.
//
// NOTHING IS REWRITTEN IN THE DATABASE. A column holds legacy plain text until
// somebody edits it, then sanitized HTML. Every reader goes through
// storedToHtml (to show it) or storedToPlain (anywhere plain text is needed:
// search, CSV, an email, a prompt), and both accept either shape.
//
// PURE module — no Prisma, no DOM — so server routes and client components
// both import it.

import { plainTextToHtml } from "@/lib/richtext/normalize";
import { richTextToPlain, sanitizeRichText } from "@/lib/richtext/sanitize";

const RICH_TAG = /<\/?(p|br|strong|b|em|i|u|s|ul|ol|li|h3|blockquote|span|a)\b[^>]*>/i;

/** Was this value written by the rich editor, or is it legacy plain text? */
export function isStoredRich(stored: string | null | undefined): boolean {
  return Boolean(stored && RICH_TAG.test(stored));
}

/**
 * A stored value as safe HTML, for RichTextView and for loading the editor.
 * Rich values are re-sanitized here as well as on save: a legacy plain note
 * that happens to contain something tag-shaped is then still harmless.
 */
export function storedToHtml(stored: string | null | undefined): string {
  if (!stored || !stored.trim()) return "";
  return isStoredRich(stored) ? sanitizeRichText(stored) : plainTextToHtml(stored.trim());
}

/** A stored value as plain text, with its paragraph breaks kept as newlines. */
export function storedToPlain(stored: string | null | undefined): string {
  if (!stored) return "";
  return isStoredRich(stored) ? richTextToPlain(stored) : stored.trim();
}

/**
 * SERVER: what to store from a submitted value. Editor HTML is sanitized; a
 * plain string (an API caller, a form that re-sends an untouched legacy value)
 * is stored as the plain text it is, so saving a page does not quietly rewrite
 * notes nobody edited. null when there is no text at all, so an emptied box
 * clears the column instead of storing "<p></p>".
 */
export function cleanRichInput(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  if (!isStoredRich(raw)) return raw.trim();
  const html = sanitizeRichText(raw);
  return richTextToPlain(html).trim() ? html : null;
}

/** Length of the words a person typed, for limits written in characters. */
export function storedPlainLength(stored: string | null | undefined): number {
  return storedToPlain(stored).length;
}

/** Two stored values as one (merging two records): rich if either is. */
export function joinStored(values: Array<string | null | undefined>): string | null {
  const present = values.filter((v): v is string => Boolean(v && storedToPlain(v)));
  if (!present.length) return null;
  if (present.length === 1) return present[0];
  if (!present.some(isStoredRich)) return present.map((v) => v.trim()).join("\n\n");
  return sanitizeRichText(present.map(storedToHtml).join("<p></p>"));
}

/**
 * One limit for every box converted in feedback cmwcjtm5k — his call, Nov 11
 * 2026, replacing three unrelated ones (1000 / 2000 / 4000) and seven boxes
 * with none. Counted on the words typed, never the markup. Measured before it
 * shipped: the longest text already in any of these columns was 1,391.
 * Interview write-ups and candidate notes are NOT under this — they run to
 * 8,558 and keep their own 20,000.
 */
export const RICH_NOTE_MAX_CHARS = 4000;

/** The message for a value over the limit, or null when it fits. */
export function richNoteTooLong(stored: string | null | undefined, max = RICH_NOTE_MAX_CHARS): string | null {
  const n = storedPlainLength(stored);
  return n > max ? `That is ${n.toLocaleString("en-US")} characters — keep it under ${max.toLocaleString("en-US")}.` : null;
}
