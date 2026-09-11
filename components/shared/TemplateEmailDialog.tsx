"use client";

import { useState, type ReactNode } from "react";
import { FlaskConical } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { EmailBodyEditor } from "@/components/shared/EmailBodyEditor";
import { formatMomentDate } from "@/lib/dates/display";

// The preview-then-confirm shell every "send a Front template" dialog has.
//
// It is the shape components/people/SendTaskEmailButton.tsx grew: load a preview,
// show who it is going to, let her edit the body for this send only, send it, and
// then replace the preview with a result that always shows its warnings. That
// shape had been copied three times before this file existed, and the travel
// reimbursement email would have been the fourth — so the fourth one is a
// parameterised version instead.
//
// THE THREE EXISTING DIALOGS ARE DELIBERATELY NOT MIGRATED ONTO THIS. They work,
// they are load-bearing, and each carries something of its own (the contacts
// email re-injects a live share link; the onboarding one has its own send
// record). Rewriting them to prove a shell is generic is a riskier change than
// the feature that needed the shell, and it can be done later on its own.
//
// WHAT THE SHELL ITSELF GUARANTEES, so a caller cannot lose it:
//   - the greeting is rendered from `greetingHtml` and is NEVER part of the
//     editable region, so an edited body cannot carry somebody else's name;
//   - the body override stays null until an edit actually happens, and null
//     means "send the live template" — the untouched case never round-trips;
//   - warnings are shown on success as well as failure, because a redirected or
//     test send is a caveat on a message that really went out;
//   - the Modal stays closable while sending (a hung send must not trap anyone);
//     the double-submit guard is on the button.

export type TemplateEmailPreview = {
  to: string[];
  /** "their SkyShare email" — the parenthetical after the address. */
  toNote?: string;
  cc: string[];
  /** "hrotasks@skyshare.com — SkyShare HR Onboarding". */
  fromLabel: string;
  subject: string;
  templateName: string;
  /** The per-recipient half. Rendered, never editable. */
  greetingHtml: string;
  /** The resolved template body — the half that can be edited. */
  bodyHtml: string;
  /** First name, for wording that addresses the recipient. */
  firstName?: string;
  /** Plain context lines shown above the address block. */
  notes?: string[];
  /** Amber caveats about this particular send. */
  warnings?: string[];
};

export type TemplateEmailAlreadySent = {
  to: string;
  sentAt: string;
  sentBy?: string | null;
  edited?: boolean;
};

export type TemplateEmailLoadResult = {
  ok: boolean;
  error?: string;
  preview?: TemplateEmailPreview;
  alreadySent?: TemplateEmailAlreadySent | null;
};

export type TemplateEmailSendResult = {
  ok: boolean;
  error?: string;
  to?: string;
  conversationId?: string;
  warnings?: string[];
  /** True when this was a dry run to an internal mailbox rather than a real send.
   *  The caller MUST set it honestly: it decides both the wording on the result
   *  screen and whether onSent() fires. */
  test?: boolean;
};

export type TemplateEmailDialogProps = {
  title: string;
  subtitle?: string;
  /** Renders the thing that opens the dialog, so the caller owns its look. */
  trigger: (open: () => void) => ReactNode;
  /** Anything that belongs above the preview and must survive a failed load —
   *  a template picker, most of all. `reload` rebuilds the preview. */
  aside?: (reload: () => void) => ReactNode;
  load: () => Promise<TemplateEmailLoadResult>;
  send: (bodyOverride: string | null, opts?: { test?: boolean }) => Promise<TemplateEmailSendResult>;
  /** When set, a "Send as test to <address>" button appears beside Send. */
  testAddress?: string;
  /** An extra line under the edited-body banner, for a dialog-specific caveat. */
  bodyNote?: string;
  /** Blocks both send buttons — e.g. no template chosen yet. */
  sendDisabled?: boolean;
  /** Shown in the footer when sendDisabled, so the dead button explains itself. */
  sendDisabledReason?: string;
  /** Appended to the green success banner — what the send changed, if anything. */
  successNote?: string;
  /** Called after a confirmed REAL send. Never after a test. */
  onSent?: () => void;
};

export function TemplateEmailDialog({
  title,
  subtitle,
  trigger,
  aside,
  load,
  send,
  testAddress,
  bodyNote,
  sendDisabled = false,
  sendDisabledReason,
  successNote,
  onSent
}: TemplateEmailDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  // Which of the two buttons is mid-flight, so only that one says "Sending…".
  const [testing, setTesting] = useState(false);
  const [loaded, setLoaded] = useState<TemplateEmailLoadResult | null>(null);
  const [result, setResult] = useState<TemplateEmailSendResult | null>(null);
  // Null until the body is actually edited. Null means "send the live template",
  // which is what keeps the untouched case byte-identical to the template.
  const [body, setBody] = useState<string | null>(null);

  async function runLoad() {
    setLoading(true);
    setLoaded(null);
    setResult(null);
    // An edit belongs to the template it was made against, so a reload after
    // changing the template must not carry the old wording forward.
    setBody(null);
    setTesting(false);
    setLoaded(await load());
    setLoading(false);
  }

  function openDialog() {
    setOpen(true);
    void runLoad();
  }

  async function confirmSend(asTest: boolean) {
    setTesting(asTest);
    setSending(true);
    const res = await send(body, asTest ? { test: true } : undefined);
    setResult(res);
    setSending(false);
    // NOT on a test. A test has changed nothing on the server, so telling the
    // page it was sent would show a state the next refresh silently takes back.
    if (res.ok && !res.test) onSent?.();
  }

  function close() {
    // Deliberately NOT blocked while sending — see Modal.tsx: busy marks the
    // dialog aria-busy but must never make it uncloseable, or a hung send traps
    // the user. The double submit is guarded on the button.
    setOpen(false);
    setTimeout(() => {
      setLoaded(null);
      setResult(null);
      setBody(null);
      setTesting(false);
    }, 200);
  }

  const p = loaded?.preview;

  return (
    <>
      {trigger(openDialog)}

      <Modal open={open} onClose={close} busy={sending} maxWidth="max-w-3xl" title={title}>
        <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-sm text-brand-grey dark:text-slate-400">{subtitle}</p> : null}

        {loading ? (
          <p className="mt-3 text-sm text-brand-grey dark:text-slate-400">
            Loading the current template from Front&hellip;
          </p>
        ) : null}

        {loaded && !loaded.ok && !result ? (
          <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
            {loaded.error}
          </p>
        ) : null}

        {/* Above the preview and outside every conditional below it: when the load
            fails BECAUSE no template is picked, the picker is the thing that
            fixes it, so it has to still be on screen. */}
        {aside && !result ? <div className="mt-3">{aside(() => void runLoad())}</div> : null}

        {/* Result screen — replaces the preview once sent. */}
        {result ? (
          <div className="mt-3">
            {result.ok && result.test ? (
              /* Blue, not green. A test really did send, so it is not a failure —
                 but it is not the thing the green banner means either, and the one
                 mistake worth designing against here is reading a test as done. */
              <div className="rounded border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-300">
                Test sent to {result.to}
                {p?.firstName ? <>, with the greeting still addressed to {p.firstName}</> : null}. Read it over, then
                come back and send it for real.
              </div>
            ) : result.ok ? (
              <div className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-500/40 dark:bg-green-500/10 dark:text-green-300">
                Sent to {result.to}.{successNote ? ` ${successNote}` : ""}
                {result.conversationId ? " It is linked to the Front conversation." : ""}
              </div>
            ) : (
              <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                {result.error}
              </div>
            )}
            {/* Warnings are ALWAYS shown, including on a success. A redirected test
                send is a caveat on a message that really went, and hiding it is how
                a test stands in for a real send. */}
            {result.warnings?.map((w) => (
              <p
                key={w}
                className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
              >
                {w}
              </p>
            ))}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {result.ok && result.test ? (
                /* Back to the SAME preview, with any edited wording still in the
                   box — "then if i like it i can send" only works if the test does
                   not throw the draft away. */
                <Button variant="secondary" onClick={() => setResult(null)}>
                  Back to the email
                </Button>
              ) : null}
              <Button onClick={close}>Close</Button>
            </div>
          </div>
        ) : null}

        {/* Nothing to preview and nothing sent — give the dialog a way out that is
            not just the X in the corner. */}
        {loaded && !loaded.ok && !result ? (
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Close
            </Button>
          </div>
        ) : null}

        {/* Preview screen */}
        {p && !result ? (
          <>
            {loaded?.alreadySent ? (
              <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                Already sent to {loaded.alreadySent.to} on {formatMomentDate(loaded.alreadySent.sentAt)}
                {loaded.alreadySent.sentBy ? ` by ${loaded.alreadySent.sentBy}` : ""}
                {loaded.alreadySent.edited ? ", with the wording edited" : ""}. Sending again will deliver a second
                copy.
              </p>
            ) : null}

            {p.warnings?.map((w) => (
              <p
                key={w}
                className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
              >
                {w}
              </p>
            ))}

            {p.notes?.map((n) => (
              <p key={n} className="mt-3 text-sm text-brand-grey dark:text-slate-400">
                {n}
              </p>
            ))}

            <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="font-semibold text-brand-grey dark:text-slate-400">To</dt>
              <dd className="text-brand-black dark:text-slate-100">
                {p.to.join(", ")}
                {p.toNote ? <span className="text-xs text-brand-grey dark:text-slate-400"> ({p.toNote})</span> : null}
              </dd>
              <dt className="font-semibold text-brand-grey dark:text-slate-400">Cc</dt>
              <dd className="text-brand-black dark:text-slate-100">
                {p.cc.length ? p.cc.join(", ") : <span className="text-brand-grey dark:text-slate-400">nobody</span>}
              </dd>
              <dt className="font-semibold text-brand-grey dark:text-slate-400">From</dt>
              <dd className="text-brand-black dark:text-slate-100">{p.fromLabel}</dd>
              <dt className="font-semibold text-brand-grey dark:text-slate-400">Subject</dt>
              <dd className="text-brand-black dark:text-slate-100">{p.subject}</dd>
              <dt className="font-semibold text-brand-grey dark:text-slate-400">Template</dt>
              <dd className="text-brand-grey dark:text-slate-400">
                {p.templateName} &middot; fetched from Front just now
              </dd>
            </dl>

            <div className="mt-3">
              <EmailBodyEditor
                greeting={p.greetingHtml}
                template={p.bodyHtml}
                edited={body}
                onChange={setBody}
                disabled={sending}
                note={bodyNote}
              />
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              {sendDisabled && sendDisabledReason ? (
                <p className="mr-auto max-w-xs text-[11px] leading-4 text-brand-grey dark:text-slate-400">
                  {sendDisabledReason}
                </p>
              ) : testAddress ? (
                <p className="mr-auto max-w-xs text-[11px] leading-4 text-brand-grey dark:text-slate-400">
                  A test goes to {testAddress}
                  {p.firstName ? `, still addressed to ${p.firstName}` : ""}. It is not recorded as sent.
                </p>
              ) : null}
              <Button variant="secondary" onClick={close} disabled={sending}>
                Cancel
              </Button>
              {testAddress ? (
                <Button variant="secondary" onClick={() => void confirmSend(true)} disabled={sending || sendDisabled}>
                  <FlaskConical className="h-4 w-4" />
                  {sending && testing ? "Sending test…" : `Send as test to ${testAddress}`}
                </Button>
              ) : null}
              <Button onClick={() => void confirmSend(false)} disabled={sending || sendDisabled}>
                {sending && !testing
                  ? "Sending…"
                  : `Send ${body === null ? "" : "edited copy "}to ${
                      p.to.length === 1 ? p.to[0] : `${p.to.length} recipients`
                    }`}
              </Button>
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}
