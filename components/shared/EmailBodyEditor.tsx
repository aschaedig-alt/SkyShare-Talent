"use client";

import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";

// The edit box every template email gets before it sends.
//
// HER RULE, asked for 2026-08-31 and restated 2026-09-09: an email built from a
// Front template must always give her a box to change what it says, because a
// send occasionally needs wording no later send should inherit. "Always" is the
// operative word — this file exists so the answer is one component rather than
// one per dialog, which is how the welcome and contacts emails ended up without
// one for a week after the orientation dialog got it.
//
// WHY A BARE contenteditable AND NOT ONE OF THE TWO EDITORS THIS APP ALREADY HAS.
// Both are lossy for this particular content, and the loss would be silent:
//
//   components/richtext/RichTextEditor runs normalizeRichHtml on load. That is
//   the right thing for a candidate note — it snaps markup down to the small
//   vocabulary the app stores (p / strong / em / a, a fixed colour and size
//   palette). Run it over a Front template and every <div style="line-height:
//   1.5"><span style="font-family: Verdana"><span style="font-size: 9pt"> becomes
//   a bare <p>. MERELY OPENING THE DIALOG would restyle the email, including in
//   the common case where nobody changes a word — which is exactly the case that
//   has to stay byte-identical to what the app sent yesterday.
//
//   components/shared/RichTextEditor is not an HTML editor at all: its value is a
//   bbcode-ish markup string ([b], [color=...]) and it serialises the DOM down to
//   that. An HTML email body put through it comes out as near-plain text.
//
// So the body is edited AS ITSELF: the resolved HTML is written into a
// contenteditable once and read back with innerHTML, with no normalisation step
// in between. That is not a new editor — there is no toolbar, no command layer
// and no document model, and the browser's own editing inherits the surrounding
// Verdana/9pt spans for typed text. What it buys is that anything untouched
// survives untouched.
//
// And the belt to that brace: an UNTOUCHED body is never sent back at all. The
// value stays null until an input event fires, and null means the server rebuilds
// from the live template exactly as before. So "she approves and sends" cannot be
// changed even by a contenteditable round-trip re-quoting an attribute.
//
// THE OVERRIDE REPLACES THE BODY AND NEVER THE GREETING. That is what makes one
// edited body safe to reuse across a batch: each recipient's greeting is still
// rebuilt from their own name, so nobody is emailed with somebody else's name at
// the top.

export type EmailBodyEditorProps = {
  /** The per-recipient half — rendered, not editable. Empty for templates that
   *  open with their own greeting. */
  greeting: string;
  /** The fully-resolved template body, as fetched from Front. */
  template: string;
  /** Null until the body is actually edited. Null === send the template. */
  edited: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
  /** An extra line under the "edited" banner, for a dialog with something
   *  specific to warn about — the contacts email keeps its live share link in
   *  the body being edited, so a pasted-over one can go stale. */
  note?: string;
};

export function EmailBodyEditor({ greeting, template, edited, onChange, disabled, note }: EmailBodyEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [seed, setSeed] = useState(0);
  const [mode, setMode] = useState<"rich" | "html">("rich");

  // Seeded imperatively, and deliberately NOT re-seeded from `edited`. Writing
  // innerHTML back under a live caret throws the caret to position 0 — the same
  // bug that was fixed in components/shared/RichTextEditor in August, where it
  // then landed inside the document's opening bold run and everything typed
  // afterwards came out bold. `seed` is bumped only by Revert and by switching
  // back from the HTML view, which are the two moments a re-seed is wanted.
  useEffect(() => {
    if (mode === "rich" && ref.current) ref.current.innerHTML = edited ?? template;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, seed, mode]);

  return (
    <div className="rounded border border-brand-lea/15 dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-lea/10 px-2.5 py-1.5 dark:border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">Body</span>
          {edited === null ? (
            <span className="rounded bg-brand-cloudDancer/70 px-1.5 py-0.5 text-[10px] font-semibold text-brand-grey dark:bg-white/5 dark:text-slate-400">
              Front template, unchanged
            </span>
          ) : (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 ring-1 ring-amber-400/50 dark:bg-amber-500/20 dark:text-amber-200">
              Edited for this send
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setMode((m) => (m === "rich" ? "html" : "rich"));
              setSeed((n) => n + 1);
            }}
            disabled={disabled}
            className="text-[11px] font-semibold text-brand-eden underline-offset-2 hover:underline disabled:opacity-50 dark:text-slate-300"
          >
            {mode === "rich" ? "Edit as HTML" : "Back to the formatted view"}
          </button>
          {edited !== null ? (
            <button
              onClick={() => {
                onChange(null);
                setSeed((n) => n + 1);
              }}
              disabled={disabled}
              className="text-[11px] font-semibold text-brand-eden underline-offset-2 hover:underline disabled:opacity-50 dark:text-slate-300"
            >
              Revert to the template
            </button>
          ) : null}
        </div>
      </div>

      {edited !== null ? (
        <p className="border-b border-amber-300/60 bg-amber-50 px-2.5 py-1.5 text-[11.5px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200">
          This wording applies to <b>this send only</b>. The template in Front is untouched, and the next send reads it
          fresh.
          {note ? <> {note}</> : null}
        </p>
      ) : null}

      {greeting ? (
        <div className="border-b border-brand-lea/10 bg-brand-cloudDancer/30 px-3 py-2 dark:border-white/10 dark:bg-white/5">
          <div
            className="prose-sm text-[12.5px] text-brand-black dark:text-slate-200"
            dangerouslySetInnerHTML={{ __html: greeting }}
          />
          <p className="mt-1 text-[10.5px] text-brand-grey dark:text-slate-400">
            Written per recipient, so it isn&apos;t editable here — each person gets their own.
          </p>
        </div>
      ) : null}

      {mode === "rich" ? (
        <div
          ref={ref}
          contentEditable={!disabled}
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="The body of this email"
          onInput={(e) => onChange((e.currentTarget as HTMLDivElement).innerHTML)}
          className={clsx(
            "prose-sm max-h-72 overflow-y-auto overflow-x-hidden bg-white px-3 py-2 text-[12.5px] text-brand-black outline-none transition",
            "focus:ring-4 focus:ring-brand-sweet/35 dark:bg-[#0f2033] dark:text-slate-200"
          )}
        />
      ) : (
        <textarea
          value={edited ?? template}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          spellCheck={false}
          rows={14}
          className="block w-full resize-y bg-white px-3 py-2 font-mono text-[11.5px] leading-relaxed text-brand-black outline-none focus:ring-4 focus:ring-brand-sweet/35 dark:bg-[#0f2033] dark:text-slate-200"
        />
      )}
    </div>
  );
}
