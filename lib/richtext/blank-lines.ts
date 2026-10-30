/**
 * Turn a line break left dangling at the END of a paragraph into a real blank
 * line (an empty paragraph).
 *
 * THE BUG THIS FIXES — feedback cmvpxe5xt (Oct 26): "the space between lines is
 * still not there. it seems to only save the line spaces if there are bullets."
 *
 * Older notes join their lines with <br> inside one paragraph. Pressing Enter
 * just before a line splits the paragraph there and leaves the <br> stranded at
 * the end of the first half:
 *
 *     <p>...send an updated resume.<br></p><p>Q: To get started...</p>
 *
 * The editor DRAWS that trailing <br> as a blank line (ProseMirror makes a
 * trailing break visible so the caret can sit on it). An ordinary web page does
 * NOT — a <br> at the very end of a block adds no line. So the blank line was
 * on screen while editing and gone the moment the note was saved and shown.
 * Measured on Teya Clarke's Jan 10 interview: 15 line breaks, 1 real blank line.
 *
 * Applied in all three places a note passes through — the server sanitizer on
 * save, the editor's loader, and the read-only view — so notes saved before
 * this fix show their blank lines too, without being re-saved.
 *
 * Pure string work, no DOM and no Prisma, so the server and the browser both
 * run it. Idempotent: its output has no trailing break left to convert.
 */

/** Inline tags a trailing break can sit inside: <p>text<span><br></span></p>. */
const INLINE_CLOSERS = "(?:\\s*<\\/(?:strong|b|em|i|u|s|strike|span|a)>)*";

/** A paragraph holding nothing but whitespace and breaks is one blank line. */
const BREAK_ONLY_PARAGRAPH = /<p>(?:\s|<br\s*\/?>)+<\/p>/gi;

/** A break, then only closing inline tags, then the end of the paragraph. */
const TRAILING_BREAK = new RegExp(`<br\\s*\\/?>(${INLINE_CLOSERS})\\s*<\\/p>`, "gi");

/**
 * The same at the end of a list item with no paragraph inside it — how older
 * notes store bullets (<li>text<br /></li>). Found by the Oct 30 check on Teya
 * Clarke's interview: one indented answer still ended in a stranded break.
 */
const TRAILING_BREAK_IN_ITEM = new RegExp(`<br\\s*\\/?>(${INLINE_CLOSERS})\\s*<\\/li>`, "gi");

export function trailingBreaksToBlankLines(html: string): string {
  if (!html || !/<br/i.test(html)) return html;
  let current = html.replace(BREAK_ONLY_PARAGRAPH, "<p></p>");
  // Each pass moves one trailing break out; "a<br><br></p>" is two blank lines,
  // which is what the editor showed. Bounded, and stops as soon as it settles.
  for (let pass = 0; pass < 20; pass += 1) {
    const next = current
      .replace(TRAILING_BREAK, "$1</p><p></p>")
      .replace(TRAILING_BREAK_IN_ITEM, "$1<p></p></li>");
    if (next === current) break;
    current = next;
  }
  return current;
}
