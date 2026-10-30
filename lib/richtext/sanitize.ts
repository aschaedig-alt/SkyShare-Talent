/**
 * Sanitize rich text before it is stored or rendered.
 *
 * WHY THIS IS WRITTEN THIS WAY. Interview write-ups are pasted straight out of
 * Paycom, Word and Gmail, so the incoming HTML is arbitrary — and it is then
 * rendered back into an authenticated page that shows candidate PII. That is a
 * stored-XSS surface, and "strip the bad bits" is the losing side of that
 * argument: every blocklist has a bypass.
 *
 * So this is an EMIT-ALLOWLIST. It walks the input, and writes out ONLY tags it
 * recognises with ONLY attributes it recognises; every piece of text is escaped
 * on the way out. Anything it does not understand is dropped rather than
 * passed through, so a payload it has never seen still cannot survive.
 *
 * The style attribute is allowed only when its value is EXACTLY one of the
 * strings the editor itself produces. That keeps colours and sizes on the
 * design system and makes CSS injection impossible, without needing a CSS
 * parser.
 */

import { trailingBreaksToBlankLines } from "@/lib/richtext/blank-lines";
import { snapTextColor, snapHighlightColor, snapFontSize, styleAttr, stripZeroWidth } from "@/lib/richtext/tokens";

const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s", "strike",
  "ul", "ol", "li", "h3", "h4", "blockquote", "span", "a", "div"
]);

/** Tags that carry no content and must not be given a closing tag. */
const VOID_TAGS = new Set(["br"]);

/**
 * Tags that implicitly close an open <p>, exactly as an HTML parser would.
 *
 * THE BUG THIS FIXES. This sanitizer filters TOKENS, so it never knew what
 * nests inside what, and it stored <ul> elements sitting directly inside a <p>
 * — five of them in one live write-up (Robert Patrick, recruiter screen). That
 * markup is invalid: a browser auto-closes the <p> when it parses it, so the
 * DOM never matches the stored string. The editor writes the string into
 * innerHTML, reads a DIFFERENT string back, and saves that — the document
 * drifts a little on every open-and-save. Closing the <p> here means what we
 * store is the tree a browser will actually build.
 */
const CLOSES_OPEN_P = new Set(["p", "div", "ul", "ol", "h3", "h4", "blockquote"]);

/**
 * Inline wrappers holding no VISIBLE text — whitespace and line breaks only.
 *
 * Unwrapped rather than deleted, so the break or space inside survives: a
 * <b><br /></b> becomes <br />, not nothing. An empty bold tag is bold nobody
 * can switch off (there is no text to select), and the caret entering one turns
 * bold on for whatever gets typed next — which is most of what "the boldness
 * was weird and I could not correct it" actually was.
 */
const EMPTY_INLINE = /<(strong|b|em|i|u|s|strike|span)(?:\s[^>]*)?>((?:\s|<br \/>)*)<\/\1>/gi;

/**
 * Blocks holding nothing but breaks are a BLANK LINE, folded to the one
 * spelling <p></p> — never deleted. Deleting them is what made "spaces between
 * lines" vanish on save (feedback cmvpiodds, Oct 26). Only the ones at the
 * very start or end of the document go.
 */
const EMPTY_BLOCK = /<p>(?:\s|<br \/>)+<\/p>/gi;
const LEADING_BLANKS = /^(?:<p><\/p>)+/;
const TRAILING_BLANKS = /(?:<p><\/p>)+$/;

/** Exact style values the editor emits — the single source is the token file. */
export { ALLOWED_STYLES } from "@/lib/richtext/tokens";

/**
 * Reduce a style attribute to the canonical tokens, snapping near-misses.
 *
 * The allowlist is still CLOSED: every string this can return is built from
 * lib/richtext/tokens.ts and never echoed from the input, so CSS injection
 * remains impossible without needing a CSS parser. What changed is what happens
 * to a value that is not an exact match. It used to be dropped outright — which
 * is why every colour, highlight and size pasted from Gmail, Word or Paycom
 * silently disappeared on save, and why formatting text in Gmail and pasting it
 * back did almost nothing. Now it snaps to the nearest brand token.
 *
 * Multiple declarations are handled too. One span carrying
 * "color: red; font-size: 20px" previously failed as a single opaque string and
 * lost both halves.
 */
function normaliseStyle(raw: string): string | null {
  const parts: { color?: string | null; highlight?: string | null; size?: number | null } = {};

  for (const declaration of raw.split(";")) {
    const at = declaration.indexOf(":");
    if (at === -1) continue;
    const property = declaration.slice(0, at).trim().toLowerCase();
    const value = declaration.slice(at + 1).trim();
    if (!value) continue;

    if (property === "color") parts.color = snapTextColor(value);
    else if (property === "background-color") parts.highlight = snapHighlightColor(value);
    else if (property === "font-size") parts.size = snapFontSize(value);
    // font-weight and friends are deliberately NOT carried. Emphasis lives in
    // tags (<strong>, <em>, ...) — which is what lib/richtext/normalize.ts
    // emits and what survives a round trip. A font-weight style here would be a
    // second, competing source of truth for bold.
  }

  return styleAttr(parts) || null;
}

/** http, https and mailto only — never javascript:, data: or a bare scheme. */
function safeHref(raw: string): string | null {
  const value = raw.trim();
  if (!/^(https?:\/\/|mailto:)/i.test(value)) return null;
  if (/[\x00-\x1f]/.test(value)) return null;
  return value;
}

/**
 * Decode HTML entities back to real characters.
 *
 * THE BUG THIS FIXES. The text this function receives is never plain text — it
 * is a slice of `element.innerHTML`, which the browser ALWAYS returns with
 * entities already escaped: a visible "&" is serialised as the five
 * characters `&amp;`. Escaping that slice again (the old code did) turns it
 * into `&amp;amp;`; render that back through the browser and ONE level of
 * decoding peels off, leaving the literal text "&amp;" on screen where an
 * ampersand should be — exactly the "the word 'and' comes out as an AMP
 * symbol" report. Decoding fully before re-encoding once makes the whole pass
 * idempotent no matter how the entity got there.
 */
function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'");
}

/**
 * Zero-width characters are stripped here as well as in the normalizer.
 *
 * They are invisible but not inert: a <b> containing nothing but a zero-width
 * space is bold you cannot select, and therefore bold you cannot switch off by
 * selecting it and clicking the button. Removing them is what lets the
 * empty-inline pass below recognise those wrappers as empty.
 */
function escapeText(text: string): string {
  return stripZeroWidth(decodeEntities(text))
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Drop wrappers that survived with nothing inside them.
 *
 * Runs to a fixed point because removing an inner empty tag can leave its
 * parent empty in turn: <p><b><span></span></b></p> takes three passes.
 */
function dropEmptyElements(html: string): string {
  let current = html;
  for (let pass = 0; pass < 8; pass += 1) {
    const next = current.replace(EMPTY_INLINE, "$2").replace(EMPTY_BLOCK, "<p></p>");
    if (next === current) return next;
    current = next;
  }
  return current;
}

function trimBlankLines(html: string): string {
  return html.replace(LEADING_BLANKS, "").replace(TRAILING_BLANKS, "");
}

/** Pull out the attributes we allow, ignoring everything else entirely. */
function renderAttributes(tag: string, attrText: string): string {
  const out: string[] = [];
  const attrPattern = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = attrPattern.exec(attrText))) {
    const name = match[1].toLowerCase();
    const value = match[3] ?? match[4] ?? "";
    if (name === "style") {
      const style = normaliseStyle(value);
      if (style) out.push(`style="${escapeText(style)}"`);
    } else if (name === "href" && tag === "a") {
      const href = safeHref(value);
      if (href) out.push(`href="${escapeText(href)}" target="_blank" rel="noopener noreferrer"`);
    } else if (name === "data-mention" && tag === "span") {
      // The email of a mentioned teammate. Validated, never rendered as a URL.
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) out.push(`data-mention="${escapeText(value)}"`);
    }
    // Everything else — class, id, onclick, srcset, anything — is dropped.
  }
  return out.length ? ` ${out.join(" ")}` : "";
}

export function sanitizeRichText(input: string | null | undefined): string {
  if (!input) return "";
  // Remove whole dangerous elements INCLUDING their contents first, so their
  // text does not survive as stray content once the tags are dropped.
  let working = input.replace(/<(script|style|iframe|object|embed|noscript|template)[\s\S]*?<\/\1\s*>/gi, "");
  // ...and any unclosed opener of the same kind.
  working = working.replace(/<(script|style|iframe|object|embed|noscript|template)\b[^>]*>/gi, "");
  // HTML comments can hide conditional-comment payloads.
  working = working.replace(/<!--[\s\S]*?-->/g, "");

  const out: string[] = [];
  const openStack: string[] = [];
  const tokenPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;

  let lastIndex = 0;
  let token: RegExpExecArray | null;
  while ((token = tokenPattern.exec(working))) {
    out.push(escapeText(working.slice(lastIndex, token.index)));
    lastIndex = tokenPattern.lastIndex;

    const raw = token[0];
    const tag = token[1].toLowerCase();
    const isClosing = raw.startsWith("</");
    if (!ALLOWED_TAGS.has(tag)) continue;

    if (isClosing) {
      // Only close a tag we actually opened, so stray closers cannot break out.
      const at = openStack.lastIndexOf(tag);
      if (at === -1) continue;
      while (openStack.length > at) out.push(`</${openStack.pop()}>`);
      continue;
    }

    if (VOID_TAGS.has(tag)) {
      out.push(`<${tag} />`);
      continue;
    }

    // A block-level opener implicitly closes an open <p>, the same way a real
    // HTML parser would — see CLOSES_OPEN_P. Without this the stored string and
    // the DOM the browser builds from it disagree, and the editor's round trip
    // rewrites the document a little every time it is opened and saved.
    if (CLOSES_OPEN_P.has(tag)) {
      const openParagraph = openStack.lastIndexOf("p");
      if (openParagraph !== -1) {
        while (openStack.length > openParagraph) out.push(`</${openStack.pop()}>`);
      }
    }

    out.push(`<${tag}${renderAttributes(tag, token[2] ?? "")}>`);
    openStack.push(tag);
  }
  out.push(escapeText(working.slice(lastIndex)));
  // Anything left open is closed here, so the result is always balanced.
  while (openStack.length) out.push(`</${openStack.pop()}>`);

  // A break stranded at the end of a paragraph becomes a real blank line — see
  // lib/richtext/blank-lines.ts (feedback cmvpxe5xt).
  return trimBlankLines(trailingBreaksToBlankLines(dropEmptyElements(out.join("")).trim()));
}

/** Plain-text version, for search and for the existing `notes`/`body` columns. */
export function richTextToPlain(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<\/(p|div|li|h3|h4|blockquote)\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Emails @-mentioned in the text, so they can be notified or surfaced. */
export function extractMentions(html: string | null | undefined): string[] {
  if (!html) return [];
  const found = new Set<string>();
  for (const m of html.matchAll(/data-mention="([^"]+)"/g)) found.add(m[1].toLowerCase());
  return [...found];
}
