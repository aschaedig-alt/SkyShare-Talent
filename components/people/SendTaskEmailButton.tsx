"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { EmailBodyEditor } from "@/components/shared/EmailBodyEditor";
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
  /** Icon only, for the post-onboard grid — that table is one small cell per
   *  check-in per person, and a full "Send email" button does not fit in it
   *  without making every row taller for the one column that has an email. */
  compact?: boolean;
};

export function SendTaskEmailButton({ hireId, taskKey, taskLabel, taskStatus, canEdit, onSent, compact = false }: Props) {
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
      {compact ? (
        <button
          type="button"
          onClick={openPreview}
          aria-label={taskStatus === "DONE" ? `Resend the ${taskLabel} email` : `Send the ${taskLabel} email`}
          title={taskStatus === "DONE" ? "Already done — click to send the email again" : "Send this check-in email"}
          className="inline-flex items-center justify-center rounded p-1 text-brand-eden transition hover:bg-brand-gold/15 dark:text-slate-300 dark:hover:bg-white/10"
        >
          <Mail className="h-3.5 w-3.5" />
        </button>
      ) : (
        <Button size="sm" variant="secondary" onClick={openPreview}>
          <Mail className="mr-1 h-3.5 w-3.5" />
          {taskStatus === "DONE" ? "Resend email" : "Send email"}
        </Button>
      )}

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
                {p.to.join(", ")}{" "}
                <span className="text-xs text-brand-grey dark:text-slate-400">
                  (
                  {p.toSource === "personal"
                    ? "their personal email"
                    : p.toSource === "company"
                      ? "their SkyShare email"
                      : "set for this step, not read from their record"}
                  )
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
              <EmailBodyEditor greeting={p.greetingHtml} template={p.bodyHtml} edited={body} onChange={setBody} disabled={sending} />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={close} disabled={sending}>
                Cancel
              </Button>
              <Button onClick={confirmSend} disabled={sending}>
                {sending
                  ? "Sending…"
                  : `Send ${body === null ? "" : "edited copy "}to ${
                      p.to.length === 1 ? p.to[0] : `${p.to.length} recipients`
                    }`}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
