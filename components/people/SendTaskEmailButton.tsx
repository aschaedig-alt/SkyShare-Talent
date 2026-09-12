"use client";

import { useState } from "react";
import { FlaskConical, Mail } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { TickedNotSentNote } from "@/components/shared/TickedNotSentNote";
import { EmailBodyEditor } from "@/components/shared/EmailBodyEditor";
import { formatMomentDate } from "@/lib/dates/display";
import type { FrontTemplateSummary } from "@/lib/front/templates";
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
//
// SEND AS TEST. Her ask, 2026-09-10: "it should be addressed to the name, in this
// case Axel, but send the test to hrotasks@skyshare.com always. then if i like it
// i can send to the candidate." So the test is the real email — same greeting,
// same body, same template — delivered somewhere safe. It deliberately leaves NO
// trace: the checklist stays untouched, no send record is written, and onSent() is
// not called, so the grid cell does not tick. Every one of those would otherwise
// say the person had been emailed when they had not. `res.test` is what tells the
// two apart, and it decides both the wording on the result screen and whether the
// grid updates — if this ever looks like dead defensiveness, it is not.
//
// THE TEMPLATE IS PICKABLE HERE TOO. His ask, 2026-09-11: "the document request
// template, maintenance and pilot need a different configuration. I saw one of
// the other emails we send out — we can click the dropdown and choose from the
// templates. Why can't I do that on this one?" One step, two audiences: the
// pilot document request and the maintenance one are different emails, and a
// single configured template cannot be both. So the configured template is the
// default, not the only option.
//
// PER-SEND ONLY, exactly like the edited body — picking the maintenance template
// for one hire must not become the default for the next pilot. Nothing is written
// back to the task's settings, which stay in Manage tasks where they belong.

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
  /** When this app last ACTUALLY sent this email, from the send log — null when
   *  it never has. The button label comes from this and NOT from taskStatus: a
   *  step ticked by hand is not a send, and reading "Resend" on one is what made
   *  a hand-ticked PRD step look like a sent email on 2026-09-09. */
  sentAt?: string | null;
  /** Icon only, for the post-onboard grid — that table is one small cell per
   *  check-in per person, and a full "Send email" button does not fit in it
   *  without making every row taller for the one column that has an email. */
  compact?: boolean;
};

export function SendTaskEmailButton({ hireId, taskKey, taskLabel, taskStatus, canEdit, onSent, compact = false, sentAt = null }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  // Which of the two buttons is mid-flight, so only that one says "Sending…".
  const [testing, setTesting] = useState(false);
  const [preview, setPreview] = useState<TaskEmailPreviewResult | null>(null);
  const [result, setResult] = useState<TaskEmailSendResult | null>(null);
  // Null until the body is actually edited. Null means "send the live template",
  // which is what keeps the untouched case byte-identical to before.
  const [body, setBody] = useState<string | null>(null);
  // The Front templates, for the picker. Null while unfetched.
  const [templates, setTemplates] = useState<FrontTemplateSummary[] | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  // The template chosen for THIS send. Null means the one the step is configured
  // with — which keeps an untouched send identical to what it was before there
  // was a picker at all.
  const [templateId, setTemplateId] = useState<string | null>(null);
  // Mid-swap to another template, so the box below is not editable against a body
  // that is about to be replaced.
  const [switching, setSwitching] = useState(false);
  // What the step is CONFIGURED with, captured from the first preview before any
  // override. Kept so the note can name the template the next send will use.
  const [configured, setConfigured] = useState<{ id: string; name: string } | null>(null);

  if (!canEdit) return null;

  /**
   * The template list, fetched when the dialog opens rather than on mount.
   *
   * The post-onboard grid renders one of these per check-in per person, so a
   * mount-time fetch would be a burst of identical calls to Front for a dialog
   * nobody has opened yet. Fetched once per component and then kept.
   */
  async function loadTemplates() {
    if (templates || templateError) return;
    try {
      const res = await fetch("/api/front/templates");
      const data = (await res.json().catch(() => null)) as
        | { templates?: FrontTemplateSummary[]; message?: string }
        | null;
      if (!res.ok) throw new Error(data?.message ?? "Could not load the templates.");
      setTemplates(data?.templates ?? []);
    } catch (e) {
      // Surfaced, not swallowed. The usual cause is a Front token problem, and an
      // empty dropdown would read as "Front has no other templates" — which is a
      // different and wrong thing to tell somebody.
      setTemplateError(e instanceof Error ? e.message : "Could not load the templates.");
    }
  }

  async function openPreview() {
    setOpen(true);
    setLoading(true);
    setPreview(null);
    setResult(null);
    setBody(null);
    setTesting(false);
    setTemplateId(null);
    setConfigured(null);
    // Not awaited: the preview is what the dialog is for, and the picker filling
    // in a moment later must not hold it up.
    void loadTemplates();
    const res = await previewTaskEmail(hireId, taskKey);
    setPreview(res);
    if (res.ok && res.preview) setConfigured({ id: res.preview.templateId, name: res.preview.templateName });
    setLoading(false);
  }

  /** Rebuild the preview from a different template, for this send only. */
  async function chooseTemplate(next: string) {
    if (next === (templateId ?? configured?.id ?? "")) return;
    // An edited body belongs to the template it was edited from. EmailBodyEditor
    // re-seeds from "edited ?? template", so keeping it would make the switch do
    // nothing visible — the old wording would simply win. So the switch discards
    // it, and says so beforehand rather than after.
    if (body !== null && !window.confirm("Switching templates replaces the wording you edited here. Continue?")) return;
    const override = next === configured?.id ? null : next;
    setTemplateId(override);
    setBody(null);
    setSwitching(true);
    setPreview(await previewTaskEmail(hireId, taskKey, override));
    setSwitching(false);
  }

  async function confirmSend(asTest: boolean) {
    setTesting(asTest);
    setSending(true);
    const res = await sendTaskEmail(hireId, taskKey, body, { test: asTest, templateOverride: templateId });
    setResult(res);
    setSending(false);
    // NOT on a test. onSent() is what flips the grid cell to done without a
    // reload, and a test has ticked nothing on the server — calling it would show
    // a done check-in that the next refresh silently takes back.
    if (res.ok && !res.test) onSent();
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
      setTesting(false);
      // The per-send template choice goes with the dialog — that is what makes it
      // per-send. The fetched LIST stays, so re-opening does not re-hit Front.
      setTemplateId(null);
      setConfigured(null);
      setSwitching(false);
    }, 200);
  }

  const p = preview?.preview;

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={openPreview}
          aria-label={sentAt ? `Resend the ${taskLabel} email` : `Send the ${taskLabel} email`}
          title={taskStatus === "DONE" ? "Already done — click to send the email again" : "Send this check-in email"}
          className="inline-flex items-center justify-center rounded p-1 text-brand-eden transition hover:bg-brand-gold/15 dark:text-slate-300 dark:hover:bg-white/10"
        >
          <Mail className="h-3.5 w-3.5" />
        </button>
      ) : (
        <Button size="sm" variant="secondary" onClick={openPreview}>
          <Mail className="mr-1 h-3.5 w-3.5" />
          {sentAt ? "Resend email" : "Send email"}
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
            {result.ok && result.test ? (
              /* Blue, not green. A test really did send, so it is not a failure —
                 but it is not the thing the green banner means either, and the one
                 mistake worth designing against here is reading a test as done. */
              <div className="rounded border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-300">
                Test sent to {result.to}
                {p ? <>, with the greeting still addressed to {p.firstName}</> : null}. Read it over, then come back and
                send it for real.
              </div>
            ) : result.ok ? (
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
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {result.ok && result.test ? (
                /* Back to the SAME preview, with any edited wording still in the
                   box — "then if i like it i can send to the candidate" only works
                   if the test does not throw the draft away. */
                <Button variant="secondary" onClick={() => setResult(null)}>
                  Back to the email
                </Button>
              ) : null}
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
                {preview.alreadySent.edited ? ", with the wording edited" : ""}
                {/* Which template it went out on. Worth saying now that the template
                    can be changed per send — "we sent the pilot one to a mechanic"
                    is otherwise unanswerable after the fact. */}
                {preview.alreadySent.templateName ? `, on the “${preview.alreadySent.templateName}” template` : ""}.
                Sending again will deliver a second copy.
              </p>
            )}

            {/* The other half of the same truth: ticked, but this app never sent it. */}
            {!preview?.alreadySent && taskStatus === "DONE" ? <TickedNotSentNote what="this step" /> : null}

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
              <dt className="self-center font-semibold text-brand-grey dark:text-slate-400">Template</dt>
              <dd className="text-brand-black dark:text-slate-100">
                <select
                  value={templateId ?? p.templateId}
                  onChange={(e) => void chooseTemplate(e.target.value)}
                  disabled={!templates || sending || switching}
                  aria-label="Front template for this send"
                  className="w-full max-w-md rounded border border-brand-lea/15 bg-white px-2 py-1 text-sm text-brand-black disabled:opacity-70 dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
                >
                  {/* The template this preview was built from is ALWAYS offered, even
                      when the live list does not carry it — one renamed or deleted in
                      Front has to show as what it was rather than silently resetting
                      the box to somebody else's template. */}
                  {!templates?.some((t) => t.id === p.templateId) ? (
                    <option value={p.templateId}>
                      {p.templateName}
                      {templates ? " (not found in Front)" : ""}
                    </option>
                  ) : null}
                  {templates?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-brand-grey dark:text-slate-400">
                  {switching
                    ? "Loading that template from Front…"
                    : p.templateOverridden && configured
                      ? `Chosen for this send only — this step still sends “${configured.name}” next time.`
                      : !templates && !templateError
                        ? "Fetched from Front just now. Loading the other templates…"
                        : "Fetched from Front just now. Pick another one to send a different version."}
                </span>
                {templateError ? (
                  <span className="mt-1 block rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                    {templateError} This email still sends on {p.templateName}.
                  </span>
                ) : null}
              </dd>
            </dl>

            <div className="mt-3">
              <EmailBodyEditor
                greeting={p.greetingHtml}
                template={p.bodyHtml}
                edited={body}
                onChange={setBody}
                disabled={sending || switching}
              />
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <p className="mr-auto max-w-xs text-[11px] leading-4 text-brand-grey dark:text-slate-400">
                A test goes to hrotasks@skyshare.com, still addressed to {p.firstName}. It does not tick the checklist
                item and is not recorded as sent.
              </p>
              <Button variant="secondary" onClick={close} disabled={sending}>
                Cancel
              </Button>
              {/* Both send buttons are held while a different template is loading —
                  what is on screen during that moment is the template being replaced,
                  and sending it would send the one she just moved off. */}
              <Button variant="secondary" onClick={() => confirmSend(true)} disabled={sending || switching}>
                <FlaskConical className="h-4 w-4" />
                {sending && testing ? "Sending test…" : "Send as test to hrotasks@skyshare.com"}
              </Button>
              <Button onClick={() => confirmSend(false)} disabled={sending || switching}>
                {sending && !testing
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
