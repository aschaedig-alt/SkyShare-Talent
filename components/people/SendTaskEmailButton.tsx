"use client";

import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { Mail } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { formatMomentDate } from "@/lib/dates/display";
import {
  previewTaskEmail,
  sendTaskEmail,
  type TaskEmailPreviewResult,
  type TaskEmailSendResult,
} from "@/app/people/actions";

// Preview-then-confirm send for a checklist task that has been pointed at a Front
// template in Manage tasks. One component for every such task — the template, the
// recipient and the cc list all come from the task's own settings, so wiring a new
// one up is picking a template, not writing a second copy of this file.
//
// The body is EDITABLE here. His rule, 2026-08-31: an email built from a template
// should still give you a box to change what it says, because a send occasionally
// needs wording no later send should inherit. It applies to this send only —
// nothing is written back to Front.

type Props = {
  hireId: string;
  taskKey: string;
  /** Shown in the dialog title so it is obvious which step is sending. */
  taskLabel: string;
  /** Current status, so a re-send says so on the button and warns in the dialog. */
  taskStatus: "TODO" | "DONE" | "NA";
  canEdit: boolean;
  /** Called after a confirmed send so the checklist can tick without a reload. */
  onSent: () => void;
};

export function SendTaskEmailButton({ hireId, taskKey, taskLabel, taskStatus, canEdit, onSent }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<TaskEmailPreviewResult | null>(null);
  const [result, setResult] = useState<TaskEmailSendResult | null>(null);
  // Null until the body is actually edited. Null means "send the live template",
  // which is what keeps the untouched case byte-identical to before.
  const [body, setBody] = useState<string | null>(null);

  if (!canEdit) return null;

  async function openPreview() {
    setOpen(true);
    setLoading(true);
    setPreview(null);
    setResult(null);
    setBody(null);
    setPreview(await previewTaskEmail(hireId, taskKey));
    setLoading(false);
  }

  async function confirmSend() {
    setSending(true);
    const res = await sendTaskEmail(hireId, taskKey, body);
    setResult(res);
    setSending(false);
    if (res.ok) onSent();
  }

  function close() {
    // Deliberately NOT blocked while sending — see Modal.tsx: busy marks the
    // dialog aria-busy but must never make it uncloseable, or a hung send traps
    // the user. The double submit is guarded on the button.
    setOpen(false);
    setTimeout(() => {
      setPreview(null);
      setResult(null);
      setBody(null);
    }, 200);
  }

  const p = preview?.preview;

  return (
    <>
      <Button size="sm" variant="secondary" onClick={openPreview}>
        <Mail className="mr-1 h-3.5 w-3.5" />
        {taskStatus === "DONE" ? "Resend email" : "Send email"}
      </Button>

      <Modal open={open} onClose={close} busy={sending} maxWidth="max-w-3xl">
        <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">{taskLabel}</h2>

        {loading && (
          <p className="mt-3 text-sm text-brand-grey dark:text-slate-400">
            Loading the current template from Front&hellip;
          </p>
        )}

        {preview && !preview.ok && (
          <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
            {preview.error}
          </p>
        )}

        {/* Result screen — replaces the preview once sent. */}
        {result && (
          <div className="mt-3">
            {result.ok ? (
              <div className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-500/40 dark:bg-green-500/10 dark:text-green-300">
                Sent to {result.to}. The checklist item is now marked done
                {result.conversationId ? " and linked to the Front conversation" : ""}.
              </div>
            ) : (
              <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                {result.error}
              </div>
            )}
            {/* Warnings are ALWAYS shown, including on a success. A redirected test
                send or an unticked checklist item is a caveat on a message that
                really went, and hiding it is how a test stands in for a real send. */}
            {result.warnings?.map((w) => (
              <p
                key={w}
                className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
              >
                {w}
              </p>
            ))}
            <div className="mt-5 flex justify-end">
              <Button onClick={close}>Close</Button>
            </div>
          </div>
        )}

        {/* Preview screen */}
        {p && !result && (
          <>
            {preview?.alreadySent && (
              <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                Already sent to {preview.alreadySent.to} on {formatMomentDate(preview.alreadySent.sentAt)}
                {preview.alreadySent.sentBy ? ` by ${preview.alreadySent.sentBy}` : ""}
                {preview.alreadySent.edited ? ", with the wording edited" : ""}. Sending again will deliver a second
                copy.
              </p>
            )}

            {p.fellBack && (
              <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                This task is set to send to the {p.toSource === "personal" ? "SkyShare" : "personal"} address, which is
                empty for this person &mdash; so it is going to their {p.toSource} one instead.
              </p>
            )}

            <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="font-semibold text-brand-grey dark:text-slate-400">To</dt>
              <dd className="text-brand-black dark:text-slate-100">
                {p.to}{" "}
                <span className="text-xs text-brand-grey dark:text-slate-400">
                  ({p.toSource === "personal" ? "personal email" : "SkyShare email"})
                </span>
              </dd>
              <dt className="font-semibold text-brand-grey dark:text-slate-400">Cc</dt>
              <dd className="text-brand-black dark:text-slate-100">
                {p.cc.length ? p.cc.join(", ") : <span className="text-brand-grey dark:text-slate-400">nobody</span>}
              </dd>
              <dt className="font-semibold text-brand-grey dark:text-slate-400">From</dt>
              <dd className="text-brand-black dark:text-slate-100">hrotasks@skyshare.com &mdash; SkyShare HR Onboarding</dd>
              <dt className="font-semibold text-brand-grey dark:text-slate-400">Subject</dt>
              <dd className="text-brand-black dark:text-slate-100">{p.subject}</dd>
              <dt className="font-semibold text-brand-grey dark:text-slate-400">Template</dt>
              <dd className="text-brand-grey dark:text-slate-400">{p.templateName} &middot; fetched from Front just now</dd>
            </dl>

            <div className="mt-3">
              <BodyEditor greeting={p.greetingHtml} template={p.bodyHtml} edited={body} onChange={setBody} disabled={sending} />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={close} disabled={sending}>
                Cancel
              </Button>
              <Button onClick={confirmSend} disabled={sending}>
                {sending ? "Sending…" : body === null ? `Send to ${p.to}` : `Send edited copy to ${p.to}`}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}

// --- editing the body before it goes ----------------------------------------
//
// The same editor as the orientation dialog (components/orientation/
// OrientationEmailPanel.tsx), and for the same reasons, restated here because
// they are the whole design:
//
// WHY A BARE contenteditable AND NOT ONE OF THE TWO EDITORS THIS APP ALREADY HAS.
// components/richtext/RichTextEditor runs normalizeRichHtml on load, which snaps
// markup down to the small vocabulary the app stores — right for a candidate
// note, but it would restyle a Front template merely by OPENING the dialog,
// including in the common case where nobody changes a word. components/shared/
// RichTextEditor is not an HTML editor at all: its value is a bbcode-ish string,
// and an HTML email put through it comes out as near-plain text.
//
// So the body is edited AS ITSELF: written into a contenteditable once and read
// back with innerHTML, with no normalisation in between. And the belt to that
// brace: an UNTOUCHED body is never sent back at all — the value stays null until
// an input event fires, and null means the server rebuilds from the live template.
// So "she approves and sends" cannot be changed even by a contenteditable
// round-trip re-quoting an attribute.
function BodyEditor({
  greeting,
  template,
  edited,
  onChange,
  disabled,
}: {
  /** The per-recipient half — rendered, not editable. Empty when the task's
      settings say the template already opens with its own greeting. */
  greeting: string;
  /** The template body as fetched from Front. */
  template: string;
  /** Null until the body is actually edited. Null === send the template. */
  edited: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [seed, setSeed] = useState(0);
  const [mode, setMode] = useState<"rich" | "html">("rich");

  // Seeded imperatively, and deliberately NOT re-seeded from `edited`. Writing
  // innerHTML back under a live caret throws the caret to position 0. `seed` is
  // bumped only by Revert and by switching back from the HTML view, which are the
  // two moments a re-seed is actually wanted.
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
        </p>
      ) : null}

      {greeting ? (
        <div className="border-b border-brand-lea/10 bg-brand-cloudDancer/30 px-3 py-2 dark:border-white/10 dark:bg-white/5">
          <div className="prose-sm text-[12.5px] text-brand-black dark:text-slate-200" dangerouslySetInnerHTML={{ __html: greeting }} />
          <p className="mt-1 text-[10.5px] text-brand-grey dark:text-slate-400">
            Written per recipient, so it isn&apos;t editable here.
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
