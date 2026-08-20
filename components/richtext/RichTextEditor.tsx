"use client";

import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered,
  Heading, Quote, Link2, Palette, Type, AtSign, Eraser
} from "lucide-react";
import { normalizeRichHtml, plainTextToHtml } from "@/lib/richtext/normalize";
import { TEXT_COLORS, HIGHLIGHT_COLORS } from "@/lib/richtext/tokens";

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
 *
 * STRUCTURE IS NORMALISED, not merely filtered — see lib/richtext/normalize.ts
 * for what that fixes and why it runs on load and on blur as well as on paste.
 */

export type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  /** Teammates who can be @-mentioned. */
  people?: Array<{ name: string; email: string }>;
};

const COLOR_LABELS = ["Navy", "Red", "Green", "Gold", "Blue"] as const;
const HIGHLIGHT_LABELS = ["Highlight gold", "Highlight red", "Highlight green"] as const;

const COLORS: Array<{ label: string; style: string; swatch: string }> = [
  ...TEXT_COLORS.map((hex, i) => ({ label: COLOR_LABELS[i], style: `color: ${hex}`, swatch: hex })),
  ...HIGHLIGHT_COLORS.map((hex, i) => ({ label: HIGHLIGHT_LABELS[i], style: `background-color: ${hex}`, swatch: hex }))
];

const SIZES: Array<{ label: string; style: string }> = [
  { label: "Small", style: "font-size: 12px" },
  { label: "Normal", style: "font-size: 14px" },
  { label: "Large", style: "font-size: 18px" },
  { label: "Huge", style: "font-size: 22px" }
];

const btn =
  "inline-flex h-7 w-7 items-center justify-center rounded border border-transparent text-brand-grey transition hover:border-brand-lea/20 hover:bg-brand-cloudDancer/60 hover:text-brand-lea dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100";

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

  // Held in a ref so the effect below can call it without listing it as a
  // dependency — depending on onChange would re-run the seed on every render of
  // a parent that passes an inline arrow function.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  /** Null until an existing value has been repaired once. */
  const seededRef = useRef<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Repair stored markup ONCE, when an existing write-up is first handed to
    // the editor. Deliberately not on every change: normalising mid-typing
    // would rewrite innerHTML under the caret and throw it to the top of the
    // document on every keystroke.
    if (value && seededRef.current === null) {
      el.innerHTML = normalizeRichHtml(value);
      // Read back what the browser actually holds rather than what we wrote —
      // it re-serialises (<br /> becomes <br>), and keeping `value` equal to
      // el.innerHTML is what stops this effect writing the DOM on every render.
      const serialized = el.innerHTML;
      seededRef.current = serialized;
      if (serialized !== value) onChangeRef.current(serialized);
      return;
    }

    // NEVER rewrite the DOM while the caret is inside it.
    //
    // This line had no focus guard, and that is the whole bug reported Aug 16
    // and again Aug 20: "I would click between words, and then my cursor would
    // go back to the start of the message and would be bold."
    //
    // Typing calls emit() on every input, which sends el.innerHTML up to the
    // parent. React re-renders a beat later, and while it does the DOM has
    // already moved on — so value is stale, the comparison below says they
    // differ, and the editor was reassigned its OWN older content. That both
    // throws the caret to offset 0 and drops whatever was typed in between.
    // Landing at offset 0 is also why the text came out bold: these write-ups
    // routinely open with a bold run, so the caret arrives INSIDE it.
    //
    // Nothing is lost by skipping: handleBlur normalises and re-emits on the
    // way out, so an external change reconciles the moment focus leaves.
    if (document.activeElement === el) return;

    if (el.innerHTML !== value) el.innerHTML = value || "";
  }, [value]);

  function emit() {
    if (ref.current) onChange(ref.current.innerHTML);
  }

  /**
   * Normalise on the way out of the editor.
   *
   * Blur is the right moment: the caret is leaving anyway, so rewriting the DOM
   * costs nothing, and it happens before the Save click that follows. This is
   * what makes an un-bold stick — whatever tangle of tags and spans execCommand
   * produced is folded back into the small vocabulary the store round-trips
   * cleanly.
   */
  function handleBlur() {
    const el = ref.current;
    if (!el) return;
    const clean = normalizeRichHtml(el.innerHTML);
    if (clean !== el.innerHTML) el.innerHTML = clean;
    seededRef.current = el.innerHTML;
    onChange(el.innerHTML);
  }

  function run(command: string, argument?: string) {
    ref.current?.focus();
    // Pin tag-based markup before every command. styleWithCSS is a
    // DOCUMENT-level sticky flag that any code on the page can have flipped, and
    // with it ON the browser expresses bold as <span style="font-weight: bold">
    // — a style the sanitizer's allowlist does not carry, so the formatting is
    // dropped on save. Tags survive; styles do not.
    try {
      document.execCommand("styleWithCSS", false, "false");
    } catch {
      // Not supported everywhere, and not worth failing the command over.
    }
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
   * whatever Word, Gmail, Google Docs or Paycom sent.
   */
  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    ref.current?.focus();
    const html = e.clipboardData.getData("text/html");
    const cleaned = html
      ? normalizeRichHtml(html)
      : plainTextToHtml(e.clipboardData.getData("text/plain"));
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

  // Keeping focus inside the editable is what makes the toolbar reliable: a
  // plain button steals focus on mousedown, which collapses the selection the
  // command was meant to act on and fires the blur normaliser mid-edit.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="rounded border border-brand-lea/20 bg-white focus-within:border-brand-gold focus-within:ring-2 focus-within:ring-brand-gold/20 dark:border-white/10 dark:bg-[#0f2033]">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-brand-lea/10 px-1.5 py-1 dark:border-white/10">
        <button type="button" onMouseDown={keepFocus} onClick={() => run("bold")} className={btn} title="Bold" aria-label="Bold"><Bold className="h-3.5 w-3.5" /></button>
        <button type="button" onMouseDown={keepFocus} onClick={() => run("italic")} className={btn} title="Italic" aria-label="Italic"><Italic className="h-3.5 w-3.5" /></button>
        <button type="button" onMouseDown={keepFocus} onClick={() => run("underline")} className={btn} title="Underline" aria-label="Underline"><Underline className="h-3.5 w-3.5" /></button>
        <button type="button" onMouseDown={keepFocus} onClick={() => run("strikeThrough")} className={btn} title="Strikethrough" aria-label="Strikethrough"><Strikethrough className="h-3.5 w-3.5" /></button>
        <button
          type="button"
          onMouseDown={keepFocus}
          onClick={() => run("removeFormat")}
          className={btn}
          title="Clear formatting from the selected text"
          aria-label="Clear formatting"
        >
          <Eraser className="h-3.5 w-3.5" />
        </button>
        <span className="mx-1 h-4 w-px bg-brand-lea/15 dark:bg-white/10" />
        <button type="button" onMouseDown={keepFocus} onClick={() => run("insertUnorderedList")} className={btn} title="Bullets" aria-label="Bulleted list"><List className="h-3.5 w-3.5" /></button>
        <button type="button" onMouseDown={keepFocus} onClick={() => run("insertOrderedList")} className={btn} title="Numbered" aria-label="Numbered list"><ListOrdered className="h-3.5 w-3.5" /></button>
        <button type="button" onMouseDown={keepFocus} onClick={() => run("formatBlock", "<h3>")} className={btn} title="Heading" aria-label="Heading"><Heading className="h-3.5 w-3.5" /></button>
        <button type="button" onMouseDown={keepFocus} onClick={() => run("formatBlock", "<blockquote>")} className={btn} title="Quote" aria-label="Quote"><Quote className="h-3.5 w-3.5" /></button>
        <span className="mx-1 h-4 w-px bg-brand-lea/15 dark:bg-white/10" />

        <div className="relative">
          <button type="button" onMouseDown={keepFocus} onClick={() => { setShowColors((v) => !v); setShowSizes(false); setShowPeople(false); }} className={btn} title="Colour" aria-label="Colour"><Palette className="h-3.5 w-3.5" /></button>
          {showColors && (
            <div className="absolute left-0 top-8 z-20 w-44 rounded border border-brand-lea/20 bg-white p-1.5 shadow-panel dark:border-white/10 dark:bg-brand-panel">
              {COLORS.map((c) => (
                <button key={c.style} type="button" onMouseDown={keepFocus} onClick={() => applyStyle(c.style)}
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
          <button type="button" onMouseDown={keepFocus} onClick={() => { setShowSizes((v) => !v); setShowColors(false); setShowPeople(false); }} className={btn} title="Text size" aria-label="Text size"><Type className="h-3.5 w-3.5" /></button>
          {showSizes && (
            <div className="absolute left-0 top-8 z-20 w-32 rounded border border-brand-lea/20 bg-white p-1.5 shadow-panel dark:border-white/10 dark:bg-brand-panel">
              {SIZES.map((s) => (
                <button key={s.style} type="button" onMouseDown={keepFocus} onClick={() => applyStyle(s.style)}
                  className="block w-full rounded px-2 py-1 text-left text-xs text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:text-slate-100 dark:hover:bg-white/10">
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button type="button" onMouseDown={keepFocus} onClick={addLink} className={btn} title="Link" aria-label="Link"><Link2 className="h-3.5 w-3.5" /></button>

        {people.length > 0 && (
          <div className="relative">
            <button type="button" onMouseDown={keepFocus} onClick={() => { setShowPeople((v) => !v); setShowColors(false); setShowSizes(false); }} className={btn} title="Mention someone" aria-label="Mention someone"><AtSign className="h-3.5 w-3.5" /></button>
            {showPeople && (
              <div className="absolute left-0 top-8 z-20 max-h-56 w-56 overflow-y-auto rounded border border-brand-lea/20 bg-white p-1.5 shadow-panel dark:border-white/10 dark:bg-brand-panel">
                {people.map((p) => (
                  <button key={p.email} type="button" onMouseDown={keepFocus} onClick={() => insertMention(p)}
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
          onBlur={handleBlur}
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
