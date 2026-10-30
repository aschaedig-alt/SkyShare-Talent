"use client";

import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { EditorContent, Mark, mergeAttributes, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, Color, BackgroundColor, FontSize } from "@tiptap/extension-text-style";
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered, IndentIncrease, IndentDecrease,
  Heading, Quote, Link2, Palette, Type, AtSign, Eraser
} from "lucide-react";
import { normalizeRichHtml, plainTextToHtml } from "@/lib/richtext/normalize";
import { trailingBreaksToBlankLines } from "@/lib/richtext/blank-lines";
import { TEXT_COLORS, HIGHLIGHT_COLORS } from "@/lib/richtext/tokens";

/**
 * The rich-text editor for interview write-ups and candidate notes.
 *
 * BUILT ON TIPTAP (ProseMirror), Oct 26. WHY, because this is the question the
 * recruiter asked ("see what weve used before, what were using now and what we
 * should be using"):
 *
 *   Before Jul 29  a plain <textarea>. No formatting at all.
 *   Jul 29–Oct 26  contentEditable + document.execCommand, plus a hand-written
 *                  normaliser to clean up what the browser produced. The DOM
 *                  WAS the document, so every quirk of Chrome's editing became
 *                  a stored-data bug that had to be found and patched one at a
 *                  time: the cursor jumping to the start (Aug 16, Aug 20,
 *                  Sep 2), bold that could not be switched off, a <label>
 *                  forwarding every click to Bold, and finally (Oct 26)
 *                  indented bullets deleted on blur and blank lines deleted on
 *                  save. execCommand is formally deprecated and no browser will
 *                  ever fix those quirks.
 *   Now            TipTap. The editor keeps a SCHEMA — a document model that
 *                  only allows valid structure: a nested bullet always lives
 *                  inside the item above it, an empty paragraph is a real blank
 *                  line, bold is a mark with a definite start and end. The
 *                  HTML is GENERATED from that model, so what is saved is
 *                  exactly what was on screen, and loading it back produces the
 *                  same document. That is the property the old editor could
 *                  never have, and it is why this is a replacement, not a patch.
 *
 * Unchanged: everything still goes through sanitizeRichText on the server
 * before storage (the editor is never the security boundary), the colour and
 * size choices are the same design tokens, and pasted HTML still runs through
 * normalizeRichHtml so Word/Gmail/Google Docs/Paycom markup is reduced to our
 * vocabulary before the editor sees it.
 *
 * DO NOT WRAP THIS COMPONENT IN A <label>. A <label> with no `for` claims the
 * first labelable descendant — the Bold button — so every click inside it
 * turns bold on (shipped 2026-07-29, three rounds of feedback to find). Use a
 * plain <div> and pass `ariaLabel`. A guard below catches it anyway.
 */

export type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  /** Teammates who can be @-mentioned. */
  people?: Array<{ name: string; email: string }>;
  /**
   * Accessible name for the editing area. Needed because this must not be
   * wrapped in a <label> — see the note above.
   */
  ariaLabel?: string;
};

const COLOR_LABELS = ["Navy", "Red", "Green", "Gold", "Blue"] as const;
const HIGHLIGHT_LABELS = ["Highlight gold", "Highlight red", "Highlight green"] as const;

const COLORS: Array<{ label: string; kind: "color" | "highlight"; hex: string }> = [
  ...TEXT_COLORS.map((hex, i) => ({ label: COLOR_LABELS[i], kind: "color" as const, hex })),
  ...HIGHLIGHT_COLORS.map((hex, i) => ({ label: HIGHLIGHT_LABELS[i], kind: "highlight" as const, hex }))
];

/** null = Normal, which clears the size rather than writing font-size: 14px everywhere. */
const SIZES: Array<{ label: string; size: string | null }> = [
  { label: "Small", size: "12px" },
  { label: "Normal", size: null },
  { label: "Large", size: "18px" },
  { label: "Huge", size: "22px" }
];

/** The colour a mention is drawn in — matches lib/richtext/normalize.ts. */
const MENTION_COLOR = "#466481";

/**
 * An @-mention: <span data-mention="email">. lib/notifications/mentions.ts finds
 * mentions by that attribute, so the stored shape must not change. Not
 * inclusive, so typing straight after a mention is ordinary text.
 */
const MentionMark = Mark.create({
  name: "mention",
  inclusive: false,
  priority: 1100,
  addAttributes() {
    return {
      email: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-mention"),
        renderHTML: (attrs) => (attrs.email ? { "data-mention": attrs.email } : {})
      }
    };
  },
  parseHTML() {
    return [{ tag: "span[data-mention]", consuming: false }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { style: `color: ${MENTION_COLOR}` }), 0];
  }
});

const btn =
  "inline-flex h-7 w-7 items-center justify-center rounded border border-transparent text-brand-grey transition hover:border-brand-lea/20 hover:bg-brand-cloudDancer/60 hover:text-brand-lea disabled:opacity-40 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100";

/**
 * On = the house selected treatment, navy filled with a gold edge (the same
 * pairing ApplicationStatusPicker uses), so the toolbar says out loud what is
 * armed at the caret.
 */
const btnOn =
  "inline-flex h-7 w-7 items-center justify-center rounded border border-brand-gold bg-brand-lea text-white transition hover:bg-brand-lea/90 dark:border-brand-gold dark:bg-brand-lea dark:text-white";

/** Shared by the editing surface and the read-only view, so they cannot drift. */
const CONTENT_CLASSES = clsx(
  "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
  // Nested bullets change marker so an indented answer reads as one.
  "[&_ul_ul]:list-[circle] [&_ul_ul_ul]:list-[square]",
  "[&_p]:my-1 [&_li>p]:my-0",
  // An empty paragraph is a deliberate blank line: give it a line's height.
  "[&_p:empty]:min-h-[1.25rem]",
  "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-brand-gold [&_blockquote]:pl-3 [&_blockquote]:italic",
  "[&_a]:text-brand-eden [&_a]:underline"
);

/** What a stored value looks like once loaded — tolerant of legacy markup. */
function toEditorHtml(value: string): string {
  return value ? normalizeRichHtml(value) : "";
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write or paste here…",
  minHeight = 160,
  people = [],
  ariaLabel
}: RichTextEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [showColors, setShowColors] = useState(false);
  const [showSizes, setShowSizes] = useState(false);
  const [showPeople, setShowPeople] = useState(false);

  // Held in a ref so the editor (created once) always calls the latest one.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  /** The last html this component handed up. A `value` equal to it is ours. */
  const ownValueRef = useRef<string>(value);

  /** For editorProps callbacks, which are bound once when the editor is created. */
  const editorRef = useRef<Editor | null>(null);

  const editor = useEditor({
    // Next renders this on the server first; ProseMirror needs a DOM.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [3] },
        code: false,
        codeBlock: false,
        horizontalRule: false,
        link: {
          openOnClick: false,
          autolink: true,
          protocols: ["http", "https", "mailto"],
          isAllowedUri: (url) => /^(https?:\/\/|mailto:)/i.test(url)
        }
      }),
      TextStyle,
      Color,
      BackgroundColor,
      FontSize,
      MentionMark
    ],
    content: toEditorHtml(value),
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
        class: clsx("w-full px-3 py-2.5 text-sm text-brand-lea outline-none dark:text-slate-100", CONTENT_CLASSES),
        style: `min-height: ${minHeight}px`
      },
      // Pasted Word/Gmail/Docs/Paycom markup is reduced to our vocabulary first
      // (brand colours, our sizes, tables flattened) — see normalize.ts.
      transformPastedHTML: (html) => normalizeRichHtml(html),
      // A plain-text paste (no html on the clipboard) keeps its blank lines,
      // which ProseMirror's default text parser would collapse.
      handlePaste: (_view, event) => {
        const data = event.clipboardData;
        if (!data || data.getData("text/html")) return false;
        const text = data.getData("text/plain");
        if (!text || !text.includes("\n") || !editorRef.current) return false;
        editorRef.current.commands.insertContent(plainTextToHtml(text));
        return true;
      }
    },
    onUpdate: ({ editor: e }) => {
      const html = e.isEmpty ? "" : e.getHTML();
      ownValueRef.current = html;
      onChangeRef.current(html);
    }
  });
  editorRef.current = editor;

  // A change from OUTSIDE (the parent clearing the box after a save) is written
  // in; our own html coming back around is not, so the caret is never moved
  // out from under the writer.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (value === ownValueRef.current) return;
    ownValueRef.current = value;
    editor.commands.setContent(toEditorHtml(value), { emitUpdate: false });
  }, [editor, value]);

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            empty: e.isEmpty,
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            underline: e.isActive("underline"),
            strike: e.isActive("strike"),
            bullet: e.isActive("bulletList"),
            ordered: e.isActive("orderedList"),
            heading: e.isActive("heading", { level: 3 }),
            quote: e.isActive("blockquote"),
            link: e.isActive("link"),
            canIndent: e.can().sinkListItem("listItem"),
            canOutdent: e.can().liftListItem("listItem")
          }
        : null
  });

  /** Guard against a <label> ancestor stealing clicks — see the file header. */
  const labelHijackRef = useRef(false);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const label = root.closest("label") as HTMLLabelElement | null;
    labelHijackRef.current =
      !!label && !label.hasAttribute("for") && !!label.control && root.contains(label.control);
  }, []);
  const blockLabelActivation = (e: React.MouseEvent) => {
    if (labelHijackRef.current) e.preventDefault();
  };

  // Keep focus (and the selection) in the editor when a toolbar button is pressed.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  const closeMenus = () => {
    setShowColors(false);
    setShowSizes(false);
    setShowPeople(false);
  };

  function chain(e: Editor) {
    return e.chain().focus();
  }

  function applyColor(c: (typeof COLORS)[number]) {
    if (!editor) return;
    if (c.kind === "color") chain(editor).setColor(c.hex).run();
    else chain(editor).setBackgroundColor(c.hex).run();
    closeMenus();
  }

  function applySize(size: string | null) {
    if (!editor) return;
    if (size) chain(editor).setFontSize(size).run();
    else chain(editor).unsetFontSize().run();
    closeMenus();
  }

  function insertMention(person: { name: string; email: string }) {
    if (!editor) return;
    chain(editor)
      .insertContent([
        { type: "text", text: `@${person.name}`, marks: [{ type: "mention", attrs: { email: person.email } }] },
        { type: "text", text: " " }
      ])
      .run();
    closeMenus();
  }

  function addLink() {
    if (!editor) return;
    if (editor.isActive("link")) {
      chain(editor).extendMarkRange("link").unsetLink().run();
      return;
    }
    const url = window.prompt("Link address (https://…)");
    if (!url) return;
    if (!/^(https?:\/\/|mailto:)/i.test(url)) {
      window.alert("Links have to start with https:// or mailto:");
      return;
    }
    if (editor.state.selection.empty) {
      chain(editor).insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href: url } }] }).run();
    } else {
      chain(editor).extendMarkRange("link").setLink({ href: url }).run();
    }
  }

  const s = state;
  const tool = (
    on: boolean | undefined,
    label: string,
    title: string,
    action: (e: Editor) => void,
    icon: React.ReactNode,
    disabled = false
  ) => (
    <button
      type="button"
      onMouseDown={keepFocus}
      onClick={() => editor && action(editor)}
      className={on ? btnOn : btn}
      title={title}
      aria-label={label}
      aria-pressed={on === undefined ? undefined : on}
      disabled={disabled}
    >
      {icon}
    </button>
  );

  return (
    <div ref={rootRef} onClick={blockLabelActivation} className="rounded border border-brand-lea/20 bg-white focus-within:border-brand-gold focus-within:ring-2 focus-within:ring-brand-gold/20 dark:border-white/10 dark:bg-[#0f2033]">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-brand-lea/10 px-1.5 py-1 dark:border-white/10">
        {tool(s?.bold, "Bold", "Bold (Ctrl+B)", (e) => chain(e).toggleBold().run(), <Bold className="h-3.5 w-3.5" />)}
        {tool(s?.italic, "Italic", "Italic (Ctrl+I)", (e) => chain(e).toggleItalic().run(), <Italic className="h-3.5 w-3.5" />)}
        {tool(s?.underline, "Underline", "Underline (Ctrl+U)", (e) => chain(e).toggleUnderline().run(), <Underline className="h-3.5 w-3.5" />)}
        {tool(s?.strike, "Strikethrough", "Strikethrough", (e) => chain(e).toggleStrike().run(), <Strikethrough className="h-3.5 w-3.5" />)}
        {tool(undefined, "Clear formatting", "Clear formatting from the selected text", (e) => chain(e).unsetAllMarks().run(), <Eraser className="h-3.5 w-3.5" />)}
        <span className="mx-1 h-4 w-px bg-brand-lea/15 dark:bg-white/10" />
        {tool(s?.bullet, "Bulleted list", "Bullets — only the selected lines", (e) => chain(e).toggleBulletList().run(), <List className="h-3.5 w-3.5" />)}
        {tool(s?.ordered, "Numbered list", "Numbered — only the selected lines", (e) => chain(e).toggleOrderedList().run(), <ListOrdered className="h-3.5 w-3.5" />)}
        {tool(undefined, "Indent", "Indent bullet (Tab)", (e) => chain(e).sinkListItem("listItem").run(), <IndentIncrease className="h-3.5 w-3.5" />, !s?.canIndent)}
        {tool(undefined, "Outdent", "Outdent bullet (Shift+Tab)", (e) => chain(e).liftListItem("listItem").run(), <IndentDecrease className="h-3.5 w-3.5" />, !s?.canOutdent)}
        {tool(s?.heading, "Heading", "Heading", (e) => chain(e).toggleHeading({ level: 3 }).run(), <Heading className="h-3.5 w-3.5" />)}
        {tool(s?.quote, "Quote", "Quote", (e) => chain(e).toggleBlockquote().run(), <Quote className="h-3.5 w-3.5" />)}
        <span className="mx-1 h-4 w-px bg-brand-lea/15 dark:bg-white/10" />

        <div className="relative">
          <button type="button" onMouseDown={keepFocus} onClick={() => { setShowColors((v) => !v); setShowSizes(false); setShowPeople(false); }} className={btn} title="Color" aria-label="Color"><Palette className="h-3.5 w-3.5" /></button>
          {showColors && (
            <div className="absolute left-0 top-8 z-20 w-44 rounded border border-brand-lea/20 bg-white p-1.5 shadow-panel dark:border-white/10 dark:bg-brand-panel">
              {COLORS.map((c) => (
                <button key={`${c.kind}-${c.hex}`} type="button" onMouseDown={keepFocus} onClick={() => applyColor(c)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:text-slate-100 dark:hover:bg-white/10">
                  <span className="h-3 w-3 rounded border border-brand-lea/25" style={{ backgroundColor: c.hex }} />
                  {c.label}
                </button>
              ))}
              <button type="button" onMouseDown={keepFocus}
                onClick={() => { if (editor) chain(editor).unsetColor().unsetBackgroundColor().run(); closeMenus(); }}
                className="mt-1 block w-full rounded border-t border-brand-lea/10 px-2 py-1 text-left text-xs text-brand-grey transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/10">
                No colour
              </button>
            </div>
          )}
        </div>

        <div className="relative">
          <button type="button" onMouseDown={keepFocus} onClick={() => { setShowSizes((v) => !v); setShowColors(false); setShowPeople(false); }} className={btn} title="Text size" aria-label="Text size"><Type className="h-3.5 w-3.5" /></button>
          {showSizes && (
            <div className="absolute left-0 top-8 z-20 w-32 rounded border border-brand-lea/20 bg-white p-1.5 shadow-panel dark:border-white/10 dark:bg-brand-panel">
              {SIZES.map((sz) => (
                <button key={sz.label} type="button" onMouseDown={keepFocus} onClick={() => applySize(sz.size)}
                  className="block w-full rounded px-2 py-1 text-left text-xs text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:text-slate-100 dark:hover:bg-white/10">
                  {sz.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {tool(s?.link, "Link", s?.link ? "Remove link" : "Link", () => addLink(), <Link2 className="h-3.5 w-3.5" />)}

        {people.length > 0 && (
          <div className="relative">
            <button type="button" onMouseDown={keepFocus} onClick={() => { setShowPeople((v) => !v); setShowColors(false); setShowSizes(false); }} className={btn} title="Mention someone" aria-label="Mention someone"><AtSign className="h-3.5 w-3.5" /></button>
            {showPeople && (
              <div className="absolute left-0 top-8 z-20 max-h-56 w-56 overflow-y-auto overflow-x-hidden rounded border border-brand-lea/20 bg-white p-1.5 shadow-panel dark:border-white/10 dark:bg-brand-panel">
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
        {(s ? s.empty : !value) && (
          <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-brand-grey/70 dark:text-slate-500">{placeholder}</span>
        )}
        {editor ? (
          <EditorContent editor={editor} />
        ) : (
          // Server render and the first client frame, before ProseMirror mounts.
          <div className="w-full px-3 py-2.5" style={{ minHeight }} />
        )}
      </div>
    </div>
  );
}

/**
 * Read-only render of stored rich text. The HTML is sanitized server-side.
 *
 * Trailing breaks are converted HERE as well as on save, so a note saved before
 * the fix shows the blank lines its author saw in the editor — see
 * lib/richtext/blank-lines.ts. (Only ever removes a <br> and adds an empty <p>,
 * so it cannot introduce anything the sanitizer would not have allowed.)
 */
export function RichTextView({ html, className }: { html: string; className?: string }) {
  if (!html) return null;
  return (
    <div
      className={clsx("text-sm text-brand-lea dark:text-slate-100", CONTENT_CLASSES, className)}
      dangerouslySetInnerHTML={{ __html: trailingBreaksToBlankLines(html) }}
    />
  );
}
