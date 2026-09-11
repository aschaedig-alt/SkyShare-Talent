"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Modal } from "@/components/ui";
import { EmailBodyEditor } from "@/components/shared/EmailBodyEditor";
import { formatMomentDate } from "@/lib/dates/display";
import type { FrontTemplateSummary } from "@/lib/front/templates";
import {
  chooseSupervisorContactTemplate,
  previewSupervisorContactEmail,
  sendSupervisorContactEmail,
  type SupervisorContactPreviewResult,
  type SupervisorContactSendResult,
} from "@/app/people/actions";

// Preview-then-confirm send of the new hire's own contact details to their
// supervisors — the reverse of SendContactsEmailButton, asked for 2026-09-10.
// The send is irreversible and lands in a real person's inbox, so the exact
// message and the resolved recipients are always shown first.
//
// TWO THINGS THIS DIALOG SHOWS THAT THE CONTACTS ONE DOES NOT.
//
// A TEMPLATE PICKER. No Front template has been written for this email yet. The
// other hand-built sends carry an rsp_ id in their source, so a missing template
// surfaces as a raw 404 and only a deploy can fix it; this one reads the live
// Front list here and remembers the choice for every hire afterwards. That is
// what lets the step be switched on the day the template exists.
//
// WHAT IS BEING DISCLOSED, spelled out. The contacts dialog shows the actual
// share URL rather than asking anyone to trust that the template holds a working
// one. The equivalent here is the hire's card: their personal mobile number is in
// this email, and the person pressing send is entitled to read it first.

type Props = {
  hireId: string;
  hireName: string;
  /** Current status of the supervisor_contact_sent task, so we can warn on a re-send. */
  taskStatus: "TODO" | "DONE" | "NA";
  canEdit: boolean;
  /** Called after a confirmed send so the checklist can tick without a full reload. */
  onSent: () => void;
};

export function SendSupervisorContactButton({ hireId, hireName, taskStatus, canEdit, onSent }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [res, setRes] = useState<SupervisorContactPreviewResult | null>(null);
  const [result, setResult] = useState<SupervisorContactSendResult | null>(null);
  // Null until the body is actually edited. Null means "send the live template",
  // which keeps the untouched case byte-identical to the template plus the card.
  const [body, setBody] = useState<string | null>(null);

  const [templates, setTemplates] = useState<FrontTemplateSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const fetched = useRef(false);

  // The template list is read from Front when the dialog opens rather than shipped
  // with the page: HR adds and renames templates there, and a list baked into the
  // page would be a copy that goes stale exactly the way a copied body would.
  useEffect(() => {
    if (!open || fetched.current) return;
    fetched.current = true;
    let live = true;
    (async () => {
      try {
        const r = await fetch("/api/front/templates");
        const data = (await r.json().catch(() => null)) as
          | { templates?: FrontTemplateSummary[]; message?: string }
          | null;
        if (!r.ok) throw new Error(data?.message ?? "Could not load the templates.");
        if (live) setTemplates(data?.templates ?? []);
      } catch (e) {
        // Surfaced with Front's own message. The usual causes are a missing token
        // or a token without the templates scope, and both need a person.
        if (live) setLoadError(e instanceof Error ? e.message : "Could not load the templates.");
      }
    })();
    return () => {
      live = false;
    };
  }, [open]);

  if (!canEdit) return null;

  async function openPreview() {
    setOpen(true);
    setLoading(true);
    setRes(null);
    setResult(null);
    setBody(null);
    setSaveError(null);
    const next = await previewSupervisorContactEmail(hireId);
    setRes(next);
    setTemplateId(next.template?.templateId ?? "");
    setLoading(false);
  }

  async function pickTemplate(id: string) {
    setTemplateId(id);
    setBody(null);
    setSaveError(null);
    if (!id) {
      setRes((cur) => (cur ? { ...cur, preview: undefined, templateError: undefined, template: null } : cur));
      return;
    }
    const chosen = {
      templateId: id,
      templateName: templates?.find((t) => t.id === id)?.name ?? id,
    };
    setLoading(true);
    setRes(await previewSupervisorContactEmail(hireId, chosen));
    setLoading(false);
    // Remembered for every hire after this one. A failure here is NOT fatal to the
    // send — the chosen template is passed to it explicitly — so it is reported as
    // "it will not be remembered", not as "you cannot send".
    const saved = await chooseSupervisorContactTemplate(chosen.templateId, chosen.templateName);
    if (!saved.ok) setSaveError(saved.error ?? "This choice could not be saved for next time.");
  }

  async function confirmSend() {
    setSending(true);
    const chosen = templateId
      ? {
          templateId,
          templateName: templates?.find((t) => t.id === templateId)?.name ?? res?.template?.templateName ?? templateId,
        }
      : null;
    const sent = await sendSupervisorContactEmail(hireId, body, chosen);
    setResult(sent);
    setSending(false);
    if (sent.ok) onSent();
  }

  function close() {
    // Deliberately NOT blocked while sending. Modal.tsx documents why: a send that
    // hangs would otherwise leave the dialog uncloseable by any means. The double
    // submit is guarded on the button instead. Closing does not cancel the send —
    // it has already left — and the result still lands on the checklist.
    setOpen(false);
    setTimeout(() => {
      setRes(null);
      setResult(null);
      setBody(null);
      setSaveError(null);
    }, 200);
  }

  const targets = res?.targets;
  const p = res?.preview;
  const card = targets?.hireCard;
  const savedMissing = Boolean(res?.template && !templates?.some((t) => t.id === res.template?.templateId));

  return (
    <>
      <Button size="sm" variant="secondary" onClick={openPreview}>
        {taskStatus === "DONE" ? "Resend to supervisor" : "Send to supervisor"}
      </Button>

      <Modal open={open} onClose={close} busy={sending} maxWidth="max-w-3xl">
        <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">
          Send {hireName}&apos;s contact details to their supervisor
        </h2>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
          Meant for once the offer letter is signed. This hands their supervisor the name, title, mobile number and
          SkyShare email below &mdash; so read it before you send it.
        </p>

        {loading && (
          <p className="mt-3 text-sm text-brand-grey dark:text-slate-400">Loading&hellip;</p>
        )}

        {res && !res.ok && (
          <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
            {res.error}
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
                {/* The send succeeded; anything below is a caveat ON that success.
                    Shown in amber rather than red so it is never read as "nothing
                    went out" — that misreading is what produces a duplicate real
                    send, of somebody's mobile number. */}
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

        {!result && (
          <>
            {res?.alreadySent && (
              <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                Already sent to {res.alreadySent.to} on {formatMomentDate(res.alreadySent.sentAt)}
                {res.alreadySent.sentBy ? ` by ${res.alreadySent.sentBy}` : ""}. Sending again will deliver a second
                copy.
              </p>
            )}

            {targets && (
              <>
                <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="font-semibold text-brand-grey dark:text-slate-400">To</dt>
                  <dd className="text-brand-black dark:text-slate-100">
                    {targets.supervisors
                      .filter((s) => s.email)
                      .map((s) => (s.name ? `${s.name} (${s.email})` : s.email))
                      .join(", ")}
                  </dd>
                  <dt className="font-semibold text-brand-grey dark:text-slate-400">Cc</dt>
                  <dd className="text-brand-black dark:text-slate-100">{targets.cc.join(", ")}</dd>
                  {p ? (
                    <>
                      <dt className="font-semibold text-brand-grey dark:text-slate-400">Subject</dt>
                      <dd className="text-brand-black dark:text-slate-100">{p.subject}</dd>
                    </>
                  ) : null}
                </dl>

                {targets.warnings.map((w) => (
                  <p
                    key={w}
                    className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
                  >
                    {w}
                  </p>
                ))}

                {/* The whole point of the dialog. Somebody's cell number is going
                    out; it is on screen, in full, before the button is pressed. */}
                {card ? (
                  <div className="mt-3 rounded border border-brand-lea/12 bg-brand-cloudDancer/30 p-3 dark:border-white/10 dark:bg-white/5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">
                      What this shares about {hireName}
                    </p>
                    <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
                      <dt className="font-semibold text-brand-grey dark:text-slate-400">Name</dt>
                      <dd className="text-brand-black dark:text-slate-100">{card.name}</dd>
                      <dt className="font-semibold text-brand-grey dark:text-slate-400">Title</dt>
                      <dd className="text-brand-black dark:text-slate-100">
                        {card.title ?? <span className="text-brand-grey dark:text-slate-400">none on file</span>}
                      </dd>
                      <dt className="font-semibold text-brand-grey dark:text-slate-400">Mobile</dt>
                      <dd className="text-brand-black dark:text-slate-100">
                        {card.phone ?? <span className="text-brand-grey dark:text-slate-400">none on file</span>}
                      </dd>
                      <dt className="font-semibold text-brand-grey dark:text-slate-400">Email</dt>
                      <dd className="break-all text-brand-black dark:text-slate-100">
                        {card.email ?? (
                          <span className="text-brand-grey dark:text-slate-400">
                            no SkyShare email yet &mdash; their personal address is never shared
                          </span>
                        )}
                      </dd>
                    </dl>
                  </div>
                ) : null}
              </>
            )}

            {/* The picker renders whatever else went wrong, because choosing a
                template is usually the thing that fixes it. */}
            <div className="mt-3">
              <label className="block text-xs font-semibold text-brand-grey dark:text-slate-400">
                Front template
                <select
                  value={templateId}
                  onChange={(e) => pickTemplate(e.target.value)}
                  disabled={!templates || sending}
                  className="mt-1 block w-full rounded border border-brand-lea/15 bg-white px-2 py-1.5 text-sm font-normal text-brand-black outline-none transition focus:border-brand-gold disabled:opacity-60 dark:border-white/10 dark:bg-brand-field dark:text-slate-100 dark:[color-scheme:dark]"
                >
                  <option value="">{templates ? "Choose a template…" : "Loading from Front…"}</option>
                  {/* The saved template is offered even if the live list no longer
                      has it, so one deleted or renamed in Front shows as what it
                      was rather than silently resetting the box. */}
                  {res?.template && savedMissing ? (
                    <option value={res.template.templateId}>{res.template.templateName} (not found in Front)</option>
                  ) : null}
                  {templates?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
                Write the wording once in Front, pick it here, and it is remembered for every hire after this. The
                contact details above are added to the end of it automatically.
              </p>
            </div>

            {loadError ? (
              <p className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                {loadError}
              </p>
            ) : null}

            {res?.templateError ? (
              <p className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                {res.templateError}
              </p>
            ) : null}

            {saveError ? (
              <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                {saveError} You can still send this one.
              </p>
            ) : null}

            {p ? (
              <>
                <p className="mt-3 text-xs text-brand-grey dark:text-slate-400">
                  Body is the live Front template &ldquo;{p.templateName}&rdquo;, fetched just now, with{" "}
                  {hireName}&apos;s details added at the end. Change the wording below for this send if you need to
                  &mdash; the template in Front stays as it is.
                </p>
                <div className="mt-2">
                  <EmailBodyEditor
                    greeting={p.greetingHtml}
                    template={p.bodyHtml}
                    edited={body}
                    onChange={setBody}
                    disabled={sending}
                    note="The contact details are part of this body, so if you rewrite it, keep the ones you want to share in it."
                  />
                </div>
              </>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={close} disabled={sending}>
                Cancel
              </Button>
              <Button onClick={confirmSend} disabled={sending || !p}>
                {sending
                  ? "Sending…"
                  : !p
                    ? "Choose a template first"
                    : body === null
                      ? `Send to ${p.to.join(", ")}`
                      : `Send edited copy to ${p.to.join(", ")}`}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
