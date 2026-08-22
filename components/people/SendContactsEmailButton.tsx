"use client";

import { useState } from "react";
import { Button, Modal } from "@/components/ui";
import {
  previewContactsEmail,
  sendContactsEmail,
  type ContactsPreviewResult,
  type ContactsSendResult,
} from "@/app/people/actions";

// Preview-then-confirm send for the day-of-orientation contacts email, mirroring
// SendOnboardingEmailButton. The send is irreversible and goes to a real new hire, so
// the exact message and the resolved recipient are always shown first.
//
// The one thing this preview shows that the onboarding one does not is the LINK being
// embedded. The share token can be rotated at any time, which kills every link already
// sent — so the person approving gets to see the actual URL that will go out, not just
// trust that the template still holds a working one.

type Props = {
  hireId: string;
  hireName: string;
  /** Current status of the contacts_link_sent task, so we can warn on a re-send. */
  taskStatus: "TODO" | "DONE" | "NA";
  canEdit: boolean;
  /** Called after a confirmed send so the checklist can tick without a full reload. */
  onSent: () => void;
};

export function SendContactsEmailButton({ hireId, taskStatus, canEdit, onSent }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<ContactsPreviewResult | null>(null);
  const [result, setResult] = useState<ContactsSendResult | null>(null);

  if (!canEdit) return null;

  async function openPreview() {
    setOpen(true);
    setLoading(true);
    setPreview(null);
    setResult(null);
    setPreview(await previewContactsEmail(hireId));
    setLoading(false);
  }

  async function confirmSend() {
    setSending(true);
    const res = await sendContactsEmail(hireId);
    setResult(res);
    setSending(false);
    if (res.ok) onSent();
  }

  function close() {
    // Deliberately NOT blocked while sending. Modal.tsx documents why: a send that
    // hangs would otherwise leave the dialog uncloseable by any means. The double
    // submit is guarded on the button instead. Closing does not cancel the send —
    // it has already left — and the result still lands on the checklist.
    setOpen(false);
    setTimeout(() => {
      setPreview(null);
      setResult(null);
    }, 200);
  }

  const p = preview?.preview;

  return (
    <>
      <Button size="sm" variant="secondary" onClick={openPreview}>
        {taskStatus === "DONE" ? "Resend contacts" : "Send contacts"}
      </Button>

      <Modal open={open} onClose={close} busy={sending} maxWidth="max-w-3xl">
        <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">
          Send the contacts link
        </h2>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
          Meant for the day of orientation. The link hands over staff names, titles and mobile
          numbers, so it is deliberately not sent with the welcome email.
        </p>

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

        {result && (
          <div className="mt-3">
            {result.ok ? (
              <>
                <div className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-500/40 dark:bg-green-500/10 dark:text-green-300">
                  Sent to {result.to}.
                  {result.warnings?.length
                    ? ""
                    : ` The checklist item is now marked done${
                        result.conversationId ? " and linked to the Front conversation" : ""
                      }.`}
                </div>
                {/* The send succeeded; anything below is a caveat ON that success. Shown
                    in amber rather than red so it is never read as "nothing went out" —
                    that misreading is what produces a duplicate real send. */}
                {result.warnings?.map((w) => (
                  <div
                    key={w}
                    className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
                  >
                    {w}
                  </div>
                ))}
              </>
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

        {p && !result && (
          <>
            {preview?.alreadySent && (
              <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                Already sent to {preview.alreadySent.to} on{" "}
                {new Date(preview.alreadySent.sentAt).toLocaleDateString()}
                {preview.alreadySent.sentBy ? ` by ${preview.alreadySent.sentBy}` : ""}. Sending
                again will deliver a second copy.
              </p>
            )}

            <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="font-semibold text-brand-grey dark:text-slate-400">To</dt>
              <dd className="text-brand-black dark:text-slate-100">
                {p.to}{" "}
                <span className="text-xs text-brand-grey dark:text-slate-400">
                  ({p.toSource === "company" ? "SkyShare email" : "personal email"})
                </span>
              </dd>
              <dt className="font-semibold text-brand-grey dark:text-slate-400">Cc</dt>
              <dd className="text-brand-black dark:text-slate-100">{p.cc.join(", ")}</dd>
              <dt className="font-semibold text-brand-grey dark:text-slate-400">Subject</dt>
              <dd className="text-brand-black dark:text-slate-100">{p.subject}</dd>
              <dt className="font-semibold text-brand-grey dark:text-slate-400">Link</dt>
              <dd className="break-all text-brand-black dark:text-slate-100">{p.shareUrl}</dd>
            </dl>

            <p className="mt-3 text-xs text-brand-grey dark:text-slate-400">
              Body is the live Front template &ldquo;{p.templateName}&rdquo; &mdash; edit it in
              Front and this preview updates.{" "}
              {p.replacedTemplateLink
                ? "The link in the template was replaced with the current one, so a stale link cannot go out."
                : "The template carried no link, so the current one was added at the end."}
            </p>

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
