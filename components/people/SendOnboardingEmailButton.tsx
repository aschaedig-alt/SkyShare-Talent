"use client";

import { useState } from "react";
import { Button, Modal } from "@/components/ui";
import {
  previewOnboardingEmail,
  sendOnboardingEmail,
  type PreviewResult,
  type SendResult,
} from "@/app/people/actions";

// Preview-then-confirm send for the "Start Your Onboarding Journey" email. The send is
// irreversible and goes to a real new hire, so the user always sees the exact message
// (live from the Front template) and the resolved recipient before anything leaves.

type Props = {
  hireId: string;
  hireName: string;
  /** Current status of the onboarding_journey task, so we can warn on a re-send. */
  taskStatus: "TODO" | "DONE" | "NA";
  canEdit: boolean;
  /** Called after a confirmed send so the checklist can tick without a full reload. */
  onSent: () => void;
};

export function SendOnboardingEmailButton({
  hireId,
  hireName,
  taskStatus,
  canEdit,
  onSent,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);

  if (!canEdit) return null;

  async function openPreview() {
    setOpen(true);
    setLoading(true);
    setPreview(null);
    setResult(null);
    setPreview(await previewOnboardingEmail(hireId));
    setLoading(false);
  }

  async function confirmSend() {
    setSending(true);
    const res = await sendOnboardingEmail(hireId);
    setResult(res);
    setSending(false);
    if (res.ok) onSent();
  }

  function close() {
    // Deliberately NOT blocked while sending — see Modal.tsx: busy marks the dialog
    // aria-busy but must never make it uncloseable, or a hung send traps the user.
    // The double submit is guarded on the button.
    setOpen(false);
    // Delay the reset so the panel doesn't visibly empty during the close transition.
    setTimeout(() => {
      setPreview(null);
      setResult(null);
    }, 200);
  }

  const p = preview?.preview;

  return (
    <>
      <Button size="sm" variant="secondary" onClick={openPreview}>
        {taskStatus === "DONE" ? "Resend email" : "Send email"}
      </Button>

      <Modal open={open} onClose={close} busy={sending} maxWidth="max-w-3xl">
        <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">
          Send &ldquo;Start Your Onboarding Journey&rdquo;
        </h2>

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
            <div className="mt-5 flex justify-end">
              <Button onClick={close}>Close</Button>
            </div>
          </div>
        )}

        {/* Preview screen */}
        {p && !result && (
          <>
            {preview?.alreadySent && (
              <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                Already sent to {preview.alreadySent.to} on{" "}
                {new Date(preview.alreadySent.sentAt).toLocaleDateString()}
                {preview.alreadySent.sentBy ? ` by ${preview.alreadySent.sentBy}` : ""}.
                Sending again will deliver a second copy.
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
              <dd className="text-brand-black dark:text-slate-100">{p.cc.join(", ")}</dd>
              <dt className="font-semibold text-brand-grey dark:text-slate-400">From</dt>
              <dd className="text-brand-black dark:text-slate-100">
                hrotasks@skyshare.com &mdash; SkyShare HR Onboarding
              </dd>
              <dt className="font-semibold text-brand-grey dark:text-slate-400">Subject</dt>
              <dd className="text-brand-black dark:text-slate-100">{p.subject}</dd>
            </dl>

            <p className="mt-3 text-xs text-brand-grey dark:text-slate-400">
              Body is the live Front template &ldquo;{p.templateName}&rdquo; &mdash; edit it in
              Front and this preview updates.
            </p>

            {/* Isolated in an iframe so the email's own styles can't leak into the app. */}
            <iframe
              title="Email preview"
              className="mt-2 h-72 w-full rounded border border-brand-lea/15 bg-white dark:border-white/10"
              srcDoc={`<body style="margin:12px;font-family:Verdana,sans-serif">${p.html}</body>`}
            />

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={close} disabled={sending}>
                Cancel
              </Button>
              <Button onClick={confirmSend} disabled={sending}>
                {sending ? "Sending…" : `Send to ${p.to}`}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
