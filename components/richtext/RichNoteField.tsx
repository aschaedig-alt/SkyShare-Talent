"use client";

import { useRef } from "react";
import { clsx } from "clsx";
import { RichTextEditor, RichTextView } from "@/components/richtext/RichTextEditor";
import { plainTextToHtml } from "@/lib/richtext/normalize";
import { isStoredRich, RICH_NOTE_MAX_CHARS, storedPlainLength, storedToHtml } from "@/lib/richtext/stored";

/**
 * A labelled rich-text box for the free-text fields that used to be plain
 * textareas (feedback cmwcjtm5k). Wraps the shared editor with the two things
 * those fields needed that the editor does not do itself:
 *
 *  - a label that is NOT a <label> element (a <label> around the editor turns
 *    every click into "Bold" — see the RichTextEditor header);
 *  - an optional save-on-leave, for the fields that saved on blur. It fires only
 *    when focus leaves the WHOLE field (not when it moves to a toolbar button)
 *    and only if something was typed, because loading a legacy plain value
 *    into the editor changes its HTML without the writer changing anything.
 *
 * `value` may be legacy plain text or stored HTML; storedToHtml reads both.
 * `onChange` is always handed editor HTML ("" when emptied).
 */
export function RichNoteField({
  label,
  labelClassName,
  value,
  onChange,
  onCommit,
  disabled = false,
  placeholder,
  minHeight = 80,
  maxChars = RICH_NOTE_MAX_CHARS,
  className
}: {
  label?: string;
  labelClassName?: string;
  value: string | null | undefined;
  onChange: (html: string) => void;
  /** Called once focus leaves the field after an edit — for save-on-blur fields. */
  onCommit?: () => void;
  disabled?: boolean;
  placeholder?: string;
  minHeight?: number;
  /** Shown as a warning once the words typed pass it; the server enforces it. */
  maxChars?: number;
  className?: string;
}) {
  const dirty = useRef(false);
  // Editor HTML goes back in UNCHANGED: the editor recognises its own output
  // and leaves the caret alone, so re-sanitizing it here would reset the caret
  // on every keystroke. Only legacy plain text is converted.
  const editorValue = !value ? "" : isStoredRich(value) ? value : plainTextToHtml(value.trim());
  const html = disabled ? storedToHtml(value) : "";
  const typed = disabled ? 0 : storedPlainLength(value);
  const over = typed > maxChars;

  return (
    <div className={className}>
      {label ? (
        <span
          className={
            labelClassName ?? "text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400"
          }
        >
          {label}
        </span>
      ) : null}
      {disabled ? (
        <div className="mt-1 min-h-[2.5rem] rounded border border-brand-lea/15 bg-white/60 px-3 py-2 dark:border-white/10 dark:bg-white/5">
          {html ? <RichTextView html={html} /> : <span className="text-sm text-brand-grey dark:text-slate-500">—</span>}
        </div>
      ) : (
        <div
          className={clsx(label ? "mt-1" : null)}
          onBlur={(e) => {
            if (!onCommit || !dirty.current) return;
            if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
            // Over the limit: keep it unsaved (and still dirty) rather than send a save the server refuses.
            if (over) return;
            dirty.current = false;
            onCommit();
          }}
        >
          <RichTextEditor
            value={editorValue}
            onChange={(next) => {
              dirty.current = true;
              onChange(next);
            }}
            placeholder={placeholder}
            minHeight={minHeight}
            ariaLabel={label}
          />
          {over ? (
            <p className="mt-1 text-[11px] font-medium text-red-700 dark:text-red-300" role="status">
              {typed.toLocaleString("en-US")} characters — over the {maxChars.toLocaleString("en-US")} limit{onCommit ? ", so this is not saved yet" : ""}.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * Read-only render of a converted column — legacy plain text or stored HTML.
 * Pass size/colour overrides with the ! modifier (e.g. "!text-[13px]"), since
 * RichTextView sets text-sm and text-brand-lea itself.
 */
export function StoredRichText({ value, className }: { value: string | null | undefined; className?: string }) {
  const html = storedToHtml(value);
  return html ? <RichTextView html={html} className={className} /> : null;
}
