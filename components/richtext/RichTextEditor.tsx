"use client";

import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered,
  Heading, Quote, Link2, Palette, Type, AtSign
} from "lucide-react";

/**
 * A small rich-text editor for interview write-ups and candidate notes.
 *
 * Built on contenteditable + execCommand. execCommand is formally deprecated
 * but is still the only thing every browser implements consistently, and the
 * alternative is a large editor dependency for what is a toolbar over a text
 * box. Everything it produces is passed through sanitizeRichText on the server
 * before storage, so the editor is a convenience and never the security
 * boundary.
 *
 * COLOUR AND SIZE ARE APPLIED BY HAND rather than through execCommand. The
 * browser's own colour command emits rgb() and its font-size command emits
 * legacy <font size="1..7">, neither of which matches the exact style strings
 * the sanitizer allows. Wrapping the selection ourselves means what is typed is
 * exactly what survives.
 */

export type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  /** Teammates who can be @-mentioned. */
  people?: Array<{ name: string; email: string }>;
};

const COLORS: Array<{ label: string; style: string; swatch: string }> = [
  { label: "Navy", style: "color: #0d2c43", swatch: "#0d2c43" },
  { label: "Red", style: "color: #ba0c2f", swatch: "#ba0c2f" },
  { label: "Green", style: "color: #1d9e75", swatch: "#1d9e75" },
  { label: "Gold", style: "color: #9a7100", swatch: "#9a7100" },
  { label: "Blue", style: "color: #466481", swatch: "#466481" },
  { label: "Highlight gold", style: "background-color: #fdf6e6", swatch: "#fdf6e6" },
  { label: "Highlight red", style: "background-color: #fdf2f4", swatch: "#fdf2f4" },
  { label: "Highlight green", style: "background-color: #e7f5ef", swatch: "#e7f5ef" }
];

const SIZES: Array<{ label: string; style: string }> = [
  { label: "Small", style: "font-size: 12px" },
  { label: "Normal", style: "font-size: 14px" },
  { label: "Large", style: "font-size: 18px" },
  { label: "Huge", style: "font-size: 22px" }
];

const btn =
  "inline-flex h-7 w-7 items-center justify-center rounded border border-transparent text-brand-grey transition hover:border-brand-lea/20 hover:bg-brand-cloudDancer/60 hover:text-brand-lea dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100";

/**
 * Normalise pasted HTML (Word, Gmail, Google Docs, Paycom) down to our own
 * small vocabulary BEFORE it ever reaches the editor.
 *
 * THE BUG THIS FIXES. With no paste handling, the browser inserted the
 * source's raw markup verbatim — arbitrary spans, inline styles, and
 * `<b>`/`<strong>` wrappers the source used to CANCEL inherited bold rather
 * than apply it (Google Docs wraps every paste in
 * `<b style="font-weight:normal" ...>`, a real, well-known artifact of its
 * copy implementation). The editor rendered that correctly at paste time
 * (the style cancels the tag), but sanitizeRichText on save keeps `<b>`
 * outright while dropping any style not on its 5-colour/4-size allowlist —
 * so the cancelling style vanished and the text came back bold on the next
 * load. Colours, fonts, and sizes from an external source have the same
 * problem in miniature: none of them survive the allowlist, so preserving
 * them here just to have them silently stripped later is pointless.
 *
 * So paste-time cleaning does not try to preserve arbitrary source styling
 * at all. It reads actual emphasis — from both the tag (`<b>`, `<em>`, ...)
 * and any inline style that overrides it (`font-weight: normal` cancels a
 * `<b>` ancestor, `font-weight: 700` applies bold with no tag at all, same
 * idea for italic/underline/strike) — and re-emits ONLY the tags this editor
 * itself produces. What you see the instant you paste is therefore exactly
 * what a save will keep: no more surprise reformatting on the next load.
 */
type PasteEmphasis = { bold: boolean; italic: boolean; underline: boolean; strike: boolean };

const BLOCK_TAGS = new Set(["P", "DIV", "SECTION", "ARTICLE", "TR", "TD", "TBODY", "THEAD", "LI"]);

function escapePasteText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Fold a tag's own semantics with any inline style that overrides it. */
function nextEmphasis(el: HTMLElement, state: PasteEmphasis): PasteEmphasis {
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
      next.underline = true;
      break;
    case "S":
    case "STRIKE":
    case "DEL":
      next.strike = true;
      break;
  }
  const style = el.style;
  const weight = style.fontWeight;
  if (weight) {
    const n = Number.parseInt(weight, 10);
    if (weight === "bold" || (!Number.isNaN(n) && n >= 600)) next.bold = true;
    else if (weight === "normal" || (!Number.isNaN(n) && n < 600)) next.bold = false;
  }
  if (style.fontStyle === "italic" || style.fontStyle === "oblique") next.italic = true;
  else if (style.fontStyle === "normal") next.italic = false;
  const decoration = style.textDecorationLine || style.textDecoration;
  if (decoration) {
    if (decoration === "none") {
      next.underline = false;
      next.strike = false;
    } else {
      if (/underline/.test(decoration)) next.underline = true;
      if (/line-through/.test(decoration)) next.strike = true;
    }
  }
  return next;
}

function wrapPasteEmphasis(text: string, state: PasteEmphasis): string {
  let out = escapePasteText(text);
  if (!out) return out;
  if (state.strike) out = `<s>${out}</s>`;
  if (state.underline) out = `<u>${out}</u>`;
  if (state.italic) out = `<em>${out}</em>`;
  if (state.bold) out = `<strong>${out}</strong>`;
  return out;
}

/** Flatten a subtree to inline content — text runs and links only. */
function walkPasteInline(node: Node, state: PasteEmphasis): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return wrapPasteEmphasis(node.textContent ?? "", state);
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  if (el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "IMG" || el.tagName === "TABLE") return "";
  if (el.tagName === "BR") return "<br />";
  if (el.tagName === "A") {
    const href = (el.getAttribute("href") ?? "").trim();
    const inner = Array.from(el.childNodes)
      .map((c) => walkPasteInline(c, state))
      .join("");
    if (/^(https?:\/\/|mailto:)/i.test(href) && !/[ -]/.test(href)) {
      return `<a href="${escapePasteText(href)}">${inner}</a>`;
    }
    return inner;
  }
  const next = nextEmphasis(el, state);
  return Array.from(el.childNodes)
    .map((c) => walkPasteInline(c, next))
    .join("");
}

function walkPasteListItem(li: Element, state: PasteEmphasis): string {
  const parts: string[] = [];
  for (const child of Array.from(li.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE && ((child as Element).tagName === "UL" || (child as Element).tagName === "OL")) {
      parts.push(walkPasteBlock(child, state));
    } else {
      parts.push(walkPasteInline(child, state));
    }
  }
  return parts.join("");
}

/** Walk block-level structure — paragraphs, lists, headings, quotes. */
function walkPasteBlock(node: Node, state: PasteEmphasis): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    return text.trim() ? `<p>${wrapPasteEmphasis(text, state)}</p>` : "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const tag = el.tagName;

  if (tag === "SCRIPT" || tag === "STYLE" || tag === "HEAD" || tag === "TABLE" || tag === "IMG") return "";
  if (tag === "BR") return "";

  if (tag === "UL" || tag === "OL") {
    const wrapper = tag === "UL" ? "ul" : "ol";
    const items = Array.from(el.children)
      .filter((c) => c.tagName === "LI")
      .map((li) => `<li>${walkPasteListItem(li, state)}</li>`)
      .join("");
    return items ? `<${wrapper}>${items}</${wrapper}>` : "";
  }

  if (tag === "BLOCKQUOTE") {
    const inner = Array.from(el.childNodes)
      .map((c) => walkPasteBlock(c, state))
      .join("");
    return inner ? `<blockquote>${inner}</blockquote>` : "";
  }

  // Every heading level collapses to h3 — the only heading the toolbar itself produces.
  if (/^H[1-6]$/.test(tag)) {
    const inner = walkPasteInline(el, state);
    return inner.trim() ? `<h3>${inner}</h3>` : "";
  }

  if (BLOCK_TAGS.has(tag)) {
    const hasBlockChild = Array.from(el.children).some(
      (c) => BLOCK_TAGS.has(c.tagName) || c.tagName === "UL" || c.tagName === "OL" || /^H[1-6]$/.test(c.tagName) || c.tagName === "BLOCKQUOTE"
    );
    if (hasBlockChild) {
      return Array.from(el.childNodes)
        .map((c) => walkPasteBlock(c, state))
        .join("");
    }
    const inner = walkPasteInline(el, state);
    return inner.trim() ? `<p>${inner}</p>` : "";
  }

  // An inline tag encountered at block position (e.g. a bare <span> or <a>
  // wrapping the whole clipboard) — its content becomes one paragraph.
  const inner = walkPasteInline(el, state);
  return inner.trim() ? `<p>${inner}</p>` : "";
}

function cleanPastedHtml(rawHtml: string): string {
  const doc = new DOMParser().parseFromString(rawHtml, "text/html");
  const base: PasteEmphasis = { bold: false, italic: false, underline: false, strike: false };
  const cleaned = Array.from(doc.body.childNodes)
    .map((c) => walkPasteBlock(c, base))
    .join("");
  return cleaned || escapePasteText(doc.body.textContent ?? "");
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write or paste here…",
  minHeight = 160,
  people = []
}: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [showColors, setShowColors] = useState(false);
  const [showSizes, setShowSizes] = useState(false);
  const [showPeople, setShowPeople] = useState(false);

  // Only write into the DOM when the incoming value genuinely differs, so the
  // caret is not thrown to the start on every keystroke.
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== value) el.innerHTML = value || "";
  }, [value]);

  function emit() {
    if (ref.current) onChange(ref.current.innerHTML);
  }

  function run(command: string, argument?: string) {
    ref.current?.focus();
    document.execCommand(command, false, argument);
    emit();
  }

  /** Wrap the current selection in a span carrying an exact allowed style. */
  function applyStyle(style: string) {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      setShowColors(false);
      setShowSizes(false);
      return;
    }
    const text = selection.toString();
    document.execCommand(
      "insertHTML",
      false,
      `<span style="${style}">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</span>`
    );
    setShowColors(false);
    setShowSizes(false);
    emit();
  }

  /**
   * Tab / Shift+Tab indent or outdent a bullet.
   *
   * A plain contentEditable does nothing useful with Tab by default — it
   * either inserts a literal tab character or, worse, moves focus OUT of the
   * editor onto the next control on the page, which is what was happening
   * here. This only takes over Tab while the caret sits inside a list item
   * (indent/outdent has no sensible meaning otherwise); everywhere else Tab
   * behaves normally, so leaving the editor by keyboard still works.
   */
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const selection = window.getSelection();
    const node = selection?.anchorNode;
    const inListItem = !!node && !!(node instanceof Element ? node : node.parentElement)?.closest("li");
    if (!inListItem) return;
    e.preventDefault();
    run(e.shiftKey ? "outdent" : "indent");
  }

  /**
   * Intercept paste so what lands in the editor is already OUR markup, not
   * whatever Word/Gmail/Google Docs sent — see cleanPastedHtml for why.
   */
  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    ref.current?.focus();
    const html = e.clipboardData.getData("text/html");
    const cleaned = html
      ? cleanPastedHtml(html)
      : e.clipboardData
          .getData("text/plain")
          .split(/\r?\n/)
          .map((line) => `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`)
          .join("");
    if (!cleaned) return;
    document.execCommand("insertHTML", false, cleaned);
    emit();
  }

  function insertMention(person: { name: string; email: string }) {
    ref.current?.focus();
    document.execCommand(
      "insertHTML",
      false,
      `<span data-mention="${person.email}" style="color: #466481">@${person.name}</span>&nbsp;`
    );
    setShowPeople(false);
    emit();
  }

  function addLink() {
    const url = window.prompt("Link address (https://…)");
    if (!url) return;
    if (!/^(https?:\/\/|mailto:)/i.test(url)) {
      window.alert("Links have to start with https:// or mailto:");
      return;
    }
    run("createLink", url);
  }

  const isEmpty = !value || value === "<br>" || value === "<p></p>";

  return (
    <div className="rounded border border-brand-lea/20 bg-white focus-within:border-brand-gold focus-within:ring-2 focus-within:ring-brand-gold/20 dark:border-white/10 dark:bg-[#0f2033]">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-brand-lea/10 px-1.5 py-1 dark:border-white/10">
        <button type="button" onClick={() => run("bold")} className={btn} title="Bold" aria-label="Bold"><Bold className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={() => run("italic")} className={btn} title="Italic" aria-label="Italic"><Italic className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={() => run("underline")} className={btn} title="Underline" aria-label="Underline"><Underline className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={() => run("strikeThrough")} className={btn} title="Strikethrough" aria-label="Strikethrough"><Strikethrough className="h-3.5 w-3.5" /></button>
        <span className="mx-1 h-4 w-px bg-brand-lea/15 dark:bg-white/10" />
        <button type="button" onClick={() => run("insertUnorderedList")} className={btn} title="Bullets" aria-label="Bulleted list"><List className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={() => run("insertOrderedList")} className={btn} title="Numbered" aria-label="Numbered list"><ListOrdered className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={() => run("formatBlock", "<h3>")} className={btn} title="Heading" aria-label="Heading"><Heading className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={() => run("formatBlock", "<blockquote>")} className={btn} title="Quote" aria-label="Quote"><Quote className="h-3.5 w-3.5" /></button>
        <span className="mx-1 h-4 w-px bg-brand-lea/15 dark:bg-white/10" />

        <div className="relative">
          <button type="button" onClick={() => { setShowColors((v) => !v); setShowSizes(false); setShowPeople(false); }} className={btn} title="Colour" aria-label="Colour"><Palette className="h-3.5 w-3.5" /></button>
          {showColors && (
            <div className="absolute left-0 top-8 z-20 w-44 rounded border border-brand-lea/20 bg-white p-1.5 shadow-panel dark:border-white/10 dark:bg-brand-panel">
              {COLORS.map((c) => (
                <button key={c.style} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => applyStyle(c.style)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:text-slate-100 dark:hover:bg-white/10">
                  <span className="h-3 w-3 rounded border border-brand-lea/25" style={{ backgroundColor: c.swatch }} />
                  {c.label}
                </button>
              ))}
              <p className="px-2 pt-1 text-[10px] text-brand-grey dark:text-slate-400">Select text first</p>
            </div>
          )}
        </div>

        <div className="relative">
          <button type="button" onClick={() => { setShowSizes((v) => !v); setShowColors(false); setShowPeople(false); }} className={btn} title="Text size" aria-label="Text size"><Type className="h-3.5 w-3.5" /></button>
          {showSizes && (
            <div className="absolute left-0 top-8 z-20 w-32 rounded border border-brand-lea/20 bg-white p-1.5 shadow-panel dark:border-white/10 dark:bg-brand-panel">
              {SIZES.map((s) => (
                <button key={s.style} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => applyStyle(s.style)}
                  className="block w-full rounded px-2 py-1 text-left text-xs text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:text-slate-100 dark:hover:bg-white/10">
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button type="button" onClick={addLink} className={btn} title="Link" aria-label="Link"><Link2 className="h-3.5 w-3.5" /></button>

        {people.length > 0 && (
          <div className="relative">
            <button type="button" onClick={() => { setShowPeople((v) => !v); setShowColors(false); setShowSizes(false); }} className={btn} title="Mention someone" aria-label="Mention someone"><AtSign className="h-3.5 w-3.5" /></button>
            {showPeople && (
              <div className="absolute left-0 top-8 z-20 max-h-56 w-56 overflow-y-auto rounded border border-brand-lea/20 bg-white p-1.5 shadow-panel dark:border-white/10 dark:bg-brand-panel">
                {people.map((p) => (
                  <button key={p.email} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertMention(p)}
                    className="block w-full rounded px-2 py-1 text-left text-xs text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:text-slate-100 dark:hover:bg-white/10">
                    {p.name}
                    <span className="block text-[10px] text-brand-grey dark:text-slate-400">{p.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="relative">
        {isEmpty && (
          <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-brand-grey/70 dark:text-slate-500">{placeholder}</span>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          onInput={emit}
          onBlur={emit}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          style={{ minHeight }}
          className={clsx(
            "prose-notes w-full px-3 py-2.5 text-sm text-brand-lea outline-none dark:text-slate-100",
            "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
            "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1",
            "[&_blockquote]:border-l-2 [&_blockquote]:border-brand-gold [&_blockquote]:pl-3 [&_blockquote]:italic",
            "[&_a]:text-brand-eden [&_a]:underline"
          )}
        />
      </div>
    </div>
  );
}

/** Read-only render of stored rich text. The HTML is sanitized server-side. */
export function RichTextView({ html, className }: { html: string; className?: string }) {
  if (!html) return null;
  return (
    <div
      className={clsx(
        "text-sm text-brand-lea dark:text-slate-100",
        "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
        "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-brand-gold [&_blockquote]:pl-3 [&_blockquote]:italic",
        "[&_a]:text-brand-eden [&_a]:underline [&_p]:my-1",
        className
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
