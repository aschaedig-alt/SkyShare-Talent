// Normalise rich text down to the small vocabulary this app actually stores.
//
// WHY THIS EXISTS, AND WHY IT RUNS MORE THAN ON PASTE.
//
// lib/richtext/sanitize.ts is a STRING filter: it walks tokens and decides
// tag-by-tag what is allowed. That makes it a good security boundary and a poor
// document model — it has no idea what nests inside what. So it happily stored
// markup no browser will ever reproduce. One live interview write-up
// (Robert Patrick, recruiter screen, Jul 29) contains, measured:
//
//     5  <ul> elements nested directly inside a <p>   (invalid; the parser
//        auto-closes the <p>, so the DOM never matches the string)
//     7  empty <p></p>
//     6  zero-width spaces
//     4  <b> tags containing nothing but a zero-width space or a <br>
//
// The consequences are exactly what was reported. The empty <b> wrappers are
// bold you cannot switch off, because there is no visible text to select. And
// because the editor writes `value` into innerHTML and reads innerHTML back,
// while the browser silently re-parses invalid nesting into a DIFFERENT tree,
// every open-and-save rewrites the document a little more.
//
// This module parses instead of pattern-matching. It walks a real DOM and
// re-emits only structures it produces itself, which means:
//   - the output always re-parses to the tree it describes (no more drift), and
//   - normalize(normalize(x)) === normalize(x), which is what makes it safe to
//     run on load, on blur and on paste alike.
//
// BROWSER ONLY (it needs DOMParser). The server still runs sanitizeRichText —
// this is a correctness pass, never the security boundary.

import {
  snapTextColor,
  snapHighlightColor,
  snapFontSize,
  snapFontAttrSize,
  styleAttr,
  stripZeroWidth
} from "@/lib/richtext/tokens";

/** Emphasis and styling inherited down the tree, folded into one value. */
export type InlineState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: string | null;
  highlight: string | null;
  size: number | null;
  mention: string | null;
};

const BASE_STATE: InlineState = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  color: null,
  highlight: null,
  size: null,
  mention: null
};

/** The colour a mention is drawn in — matches the editor's own insertMention. */
const MENTION_COLOR = "#466481";

const BLOCK_TAGS = new Set([
  "P", "DIV", "SECTION", "ARTICLE", "MAIN", "HEADER", "FOOTER", "ASIDE", "NAV",
  "FIGURE", "FIGCAPTION", "DL", "DT", "DD", "ADDRESS", "FORM", "FIELDSET", "CENTER", "PRE"
]);

/** Dropped with their contents — they carry no text anybody wrote. */
const DROP_ENTIRELY = new Set([
  "SCRIPT", "STYLE", "HEAD", "TITLE", "META", "LINK", "NOSCRIPT", "IFRAME",
  "OBJECT", "EMBED", "TEMPLATE", "IMG", "SVG", "VIDEO", "AUDIO", "CANVAS",
  "BUTTON", "INPUT", "SELECT", "TEXTAREA", "COLGROUP", "COL"
]);

const isHeading = (tag: string) => /^H[1-6]$/.test(tag);

const isBlockish = (tag: string) =>
  BLOCK_TAGS.has(tag) || tag === "UL" || tag === "OL" || tag === "BLOCKQUOTE" || tag === "TABLE" || isHeading(tag);

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

/**
 * http, https and mailto only.
 *
 * THE BUG THIS REPLACES: the old test was /[ -]/, which reads as "space or
 * hyphen" and is actually a character RANGE from U+0020 to U+002D. It therefore
 * rejected any URL containing ! " # $ % & ' ( ) * + , or - — which is most real
 * links, including every hyphenated domain. Pasted links were being silently
 * unwrapped to plain text at both ends of the round trip.
 */
export function safeLinkHref(raw: string): string | null {
  const value = raw.trim();
  if (!/^(https?:\/\/|mailto:)/i.test(value)) return null;
  if (/[\s<>"']/.test(value)) return null;
  return value;
}

/**
 * Fold one element's own semantics into the inherited state.
 *
 * Both the TAG and any inline style count, and a style can CANCEL a tag:
 * font-weight:normal on a <b> ancestor un-bolds (Google Docs wraps every paste
 * in exactly that), and font-weight:700 bolds with no tag at all. Colour, size
 * and highlight are assigned unconditionally when the property is present, so
 * an explicitly neutral value clears an inherited one rather than being ignored.
 */
function nextState(el: HTMLElement, state: InlineState): InlineState {
  const next = { ...state };

  switch (el.tagName) {
    case "B":
    case "STRONG":
      next.bold = true;
      break;
    case "I":
    case "EM":
      next.italic = true;
      break;
    case "U":
    case "INS":
      next.underline = true;
      break;
    case "S":
    case "STRIKE":
    case "DEL":
      next.strike = true;
      break;
    case "MARK":
      next.highlight = next.highlight ?? "#fdf6e6";
      break;
  }

  const style = el.style;

  const weight = style.fontWeight;
  if (weight) {
    const numeric = Number.parseInt(weight, 10);
    if (weight === "bold" || weight === "bolder" || (!Number.isNaN(numeric) && numeric >= 600)) next.bold = true;
    else if (weight === "normal" || weight === "lighter" || (!Number.isNaN(numeric) && numeric < 600)) next.bold = false;
  }

  if (style.fontStyle === "italic" || style.fontStyle === "oblique") next.italic = true;
  else if (style.fontStyle === "normal") next.italic = false;

  const decoration = style.textDecorationLine || style.textDecoration;
  if (decoration) {
    if (/none/.test(decoration)) {
      next.underline = false;
      next.strike = false;
    } else {
      if (/underline/.test(decoration)) next.underline = true;
      if (/line-through/.test(decoration)) next.strike = true;
    }
  }

  if (style.color) next.color = snapTextColor(style.color);
  if (style.backgroundColor) next.highlight = snapHighlightColor(style.backgroundColor);
  if (style.fontSize) next.size = snapFontSize(style.fontSize);

  // Legacy <font color size>, still emitted by Word and older Gmail.
  if (el.tagName === "FONT") {
    const color = el.getAttribute("color");
    if (color) next.color = snapTextColor(color);
    const size = el.getAttribute("size");
    if (size) next.size = snapFontAttrSize(size);
  }

  const mention = el.getAttribute("data-mention");
  if (mention && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mention)) {
    next.mention = mention;
    next.color = next.color ?? MENTION_COLOR;
  }

  return next;
}

/**
 * Emit one run of text with its state applied.
 *
 * Whitespace-only runs are emitted BARE. Wrapping them would produce
 * <strong> </strong>, which the sanitizer's empty-inline pass then removes —
 * taking the space, and the word boundary, with it.
 */
function wrapInline(rawText: string, state: InlineState): string {
  const text = stripZeroWidth(rawText);
  if (!text) return "";
  if (!text.trim()) return escapeHtml(text);

  let out = escapeHtml(text);

  const style = styleAttr({ color: state.color, highlight: state.highlight, size: state.size });
  if (state.mention) {
    out = `<span data-mention="${escapeAttr(state.mention)}"${style ? ` style="${style}"` : ""}>${out}</span>`;
  } else if (style) {
    out = `<span style="${style}">${out}</span>`;
  }

  if (state.strike) out = `<s>${out}</s>`;
  if (state.underline) out = `<u>${out}</u>`;
  if (state.italic) out = `<em>${out}</em>`;
  if (state.bold) out = `<strong>${out}</strong>`;
  return out;
}

function childrenInline(el: Node, state: InlineState): string {
  return Array.from(el.childNodes)
    .map((child) => walkInline(child, state))
    .join("");
}

/** Flatten a subtree to inline content — text runs, breaks and links only. */
function walkInline(node: Node, state: InlineState): string {
  if (node.nodeType === Node.TEXT_NODE) return wrapInline(node.textContent ?? "", state);
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as HTMLElement;
  const tag = el.tagName;

  if (DROP_ENTIRELY.has(tag)) return "";
  if (tag === "BR") return "<br />";

  const inner = nextState(el, state);

  if (tag === "A") {
    const href = safeLinkHref(el.getAttribute("href") ?? "");
    const content = childrenInline(el, inner);
    if (!content.trim()) return content;
    return href ? `<a href="${escapeAttr(href)}">${content}</a>` : content;
  }

  return childrenInline(el, inner);
}

/**
 * A paragraph, unless it would be an empty one.
 *
 * A block whose whole content is line breaks and whitespace contributes
 * nothing — paragraph spacing already comes from the [&_p]:my-1 rule — and
 * dropping it is what removes the 7 empty <p></p> and the stray <p><br></p>
 * from documents like the one described at the top of this file.
 */
function emitParagraph(inner: string): string {
  const meaningful = inner.replace(/<br \/>/g, "").trim();
  return meaningful ? `<p>${inner}</p>` : "";
}

function walkListItem(li: HTMLElement, state: InlineState): string {
  const parts: string[] = [];
  for (const child of Array.from(li.childNodes)) {
    const tag = child.nodeType === Node.ELEMENT_NODE ? (child as Element).tagName : "";
    if (tag === "UL" || tag === "OL") parts.push(walkBlock(child, state));
    else parts.push(walkInline(child, state));
  }
  return parts.join("");
}

function walkList(el: HTMLElement, state: InlineState): string {
  const wrapper = el.tagName === "UL" ? "ul" : "ol";
  const items: string[] = [];
  for (const child of Array.from(el.children)) {
    if (child.tagName !== "LI") continue;
    const li = child as HTMLElement;
    const content = walkListItem(li, nextState(li, state));
    if (content.trim()) items.push(`<li>${content}</li>`);
  }
  return items.length ? `<${wrapper}>${items.join("")}</${wrapper}>` : "";
}

/**
 * Tables are FLATTENED, never dropped.
 *
 * The previous paste cleaner returned "" for a <table> and every one of its
 * descendants, so pasting anything laid out in a table lost the CONTENT, not
 * just the formatting — and Word, Outlook and Paycom all use tables for layout.
 *
 * Two shapes, told apart by what is inside: a layout wrapper (one cell, or any
 * cell holding block content) has its cells walked as ordinary blocks, because
 * treating it as data would collapse a whole document into one line. A real
 * data table becomes one paragraph per row.
 */
function walkTable(el: HTMLElement, state: InlineState): string {
  const table = el as HTMLTableElement;
  const rows = Array.from(table.rows ?? []);
  if (rows.length === 0) return "";

  const cellsOf = (row: HTMLTableRowElement) =>
    Array.from(row.children).filter((c) => c.tagName === "TD" || c.tagName === "TH") as HTMLElement[];

  const allCells = rows.flatMap(cellsOf);
  if (allCells.length === 0) return "";

  const isLayout =
    allCells.length <= 1 ||
    allCells.some((cell) => Array.from(cell.children).some((child) => isBlockish(child.tagName)));

  if (isLayout) {
    return allCells.map((cell) => childrenBlock(cell, nextState(cell, state))).join("");
  }

  return rows
    .map((row) => {
      const parts = cellsOf(row)
        .map((cell) => childrenInline(cell, nextState(cell, state)).trim())
        .filter(Boolean);
      return parts.length ? emitParagraph(parts.join(" — ")) : "";
    })
    .join("");
}

function childrenBlock(el: Node, state: InlineState): string {
  return Array.from(el.childNodes)
    .map((child) => walkBlock(child, state))
    .join("");
}

/** Walk block-level structure — paragraphs, lists, headings, quotes, tables. */
function walkBlock(node: Node, state: InlineState): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return emitParagraph(wrapInline(node.textContent ?? "", state));
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as HTMLElement;
  const tag = el.tagName;

  if (DROP_ENTIRELY.has(tag)) return "";
  // A break BETWEEN blocks is spacing, not content; blocks already space themselves.
  if (tag === "BR") return "";

  if (tag === "TABLE") return walkTable(el, nextState(el, state));
  if (tag === "UL" || tag === "OL") return walkList(el, nextState(el, state));

  if (tag === "BLOCKQUOTE") {
    const inner = childrenBlock(el, nextState(el, state));
    return inner.trim() ? `<blockquote>${inner}</blockquote>` : "";
  }

  // Every heading level collapses to h3 — the only one the toolbar produces.
  if (isHeading(tag)) {
    const inner = childrenInline(el, nextState(el, state));
    return inner.trim() ? `<h3>${inner}</h3>` : "";
  }

  if (BLOCK_TAGS.has(tag) || tag === "LI" || tag === "TR" || tag === "TD" || tag === "TH") {
    const inner = nextState(el, state);
    const hasBlockChild = Array.from(el.children).some((child) => isBlockish(child.tagName));
    if (hasBlockChild) return childrenBlock(el, inner);
    return emitParagraph(childrenInline(el, inner));
  }

  // An inline tag sitting at block position — a bare <span> or <a> wrapping the
  // whole clipboard. Its content becomes one paragraph.
  return emitParagraph(walkInline(el, state));
}

/**
 * Normalise a fragment of rich text.
 *
 * Idempotent: the output only contains structures this function emits, so
 * running it again returns the same string. That is what lets it run on load,
 * on blur and on paste without the document drifting each time.
 */
export function normalizeRichHtml(rawHtml: string): string {
  if (!rawHtml || !rawHtml.trim()) return "";
  // Server-side (and in any environment without a DOM) leave the input alone.
  // sanitizeRichText still runs, so nothing unsafe gets through either way.
  if (typeof DOMParser === "undefined") return rawHtml;

  const doc = new DOMParser().parseFromString(rawHtml, "text/html");
  return childrenBlock(doc.body, BASE_STATE).trim();
}

/**
 * Turn plain text into paragraphs — the clipboard's text/plain fallback, used
 * when a source offers no HTML at all.
 */
export function plainTextToHtml(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => emitParagraph(escapeHtml(stripZeroWidth(line))))
    .join("");
}
