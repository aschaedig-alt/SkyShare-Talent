"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { Modal } from "@/components/ui/Modal";
import { EmailBodyEditor } from "@/components/shared/EmailBodyEditor";
import {
  SIGNOFF_DEPARTMENTS,
  SIGNOFF_LINK_DAYS,
  defaultSignoffBodyHtml,
  defaultSignoffSubject,
  looksLikeEmail,
  signoffGreetingHtml,
  type SignoffRequestView
} from "@/lib/quality-of-hire/signoff-questions";

// Send one hiring manager their sign-off link, or resend / cancel one already out.
// The email body is the app's wording, EDITABLE for this send (her standing rule for
// every send, and his ask Nov 21: "let me edit whatever you type it up to say"). The
// link is added under the body by the server, so an edit can never drop it.

export function SignoffSendDialog({
  request,
  onClose,
  onChanged
}: {
  /** An open request to resend or cancel; null = a new one. */
  request: SignoffRequestView | null;
  onClose: () => void;
  onChanged: (view: SignoffRequestView) => void;
}) {
  const [toName, setToName] = useState(request?.toName ?? "");
  const [to, setTo] = useState(request?.to ?? "");
  const [departments, setDepartments] = useState<string[]>(request?.departments ?? []);
  const [subject, setSubject] = useState(defaultSignoffSubject());
  const [body, setBody] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [sent, setSent] = useState<SignoffRequestView | null>(null);

  const canSend = looksLikeEmail(to) && departments.length > 0 && !busy;

  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/quality-of-hire/signoff-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = (await res.json().catch(() => ({}))) as { message?: string; request?: SignoffRequestView; warnings?: string[] };
      if (!res.ok || !data.request) throw new Error(data.message || "That did not work.");
      onChanged(data.request);
      if (payload.action === "cancel") {
        onClose();
        return;
      }
      setSent(data.request);
      setNotes(data.warnings ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  const label = "text-xs font-semibold text-brand-lea dark:text-slate-100";
  const field =
    "w-full min-w-0 rounded border border-brand-lea/20 px-3 py-2 text-sm font-normal outline-none focus:border-brand-gold dark:border-white/10 dark:bg-brand-field dark:text-slate-100";

  return (
    <Modal open onClose={onClose} busy={busy} maxWidth="max-w-2xl" title={request ? `Resend the sign-off link to ${request.toName ?? request.to}` : "Send a sign-off link"}>
      <div className="p-5 text-left">
        <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">{request ? "Resend the sign-off link" : "Send a sign-off link"}</h2>
        <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
          Emails one hiring manager a link to the sign-off form for the departments you tick. No login needed; it works once, for {SIGNOFF_LINK_DAYS} days.
          {request ? " Resending keeps the same link and restarts its clock." : ""} Their answers appear on this tab.
        </p>

        {sent ? (
          <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            Sent to {sent.toName ? `${sent.toName} (${sent.to})` : sent.to}.
          </div>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className={clsx("grid gap-1", label)}>
                Name
                <input id="so-send-name" value={toName} onChange={(e) => setToName(e.target.value)} placeholder="Who signs off" className={field} />
              </label>
              <label className={clsx("grid gap-1", label)}>
                Email
                <input id="so-send-email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@skyshare.com" className={field} />
              </label>
            </div>

            <fieldset className="mt-4">
              <legend className={label}>Departments they sign off for</legend>
              <div className="mt-1.5 grid gap-1 sm:grid-cols-2">
                {SIGNOFF_DEPARTMENTS.map((d) => {
                  const on = departments.includes(d);
                  return (
                    <label key={d} className="inline-flex items-center gap-2 text-sm text-brand-lea dark:text-slate-100">
                      <input type="checkbox" checked={on} onChange={() => setDepartments(on ? departments.filter((x) => x !== d) : [...departments, d])} className="h-4 w-4" />
                      {d}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <label className={clsx("mt-4 grid gap-1", label)}>
              Subject
              <input id="so-send-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className={field} />
            </label>

            <div className="mt-3">
              <EmailBodyEditor
                greeting={signoffGreetingHtml(toName || null)}
                template={defaultSignoffBodyHtml(departments)}
                edited={body}
                onChange={setBody}
                disabled={busy}
                source="app"
                note="The sign-off link is added under this message when it sends, so editing the wording cannot lose it."
              />
              <p className="mt-1.5 text-xs text-brand-grey dark:text-slate-400">
                Added under the message: <span className="font-semibold text-brand-lea underline dark:text-slate-100">Open your sign-off form</span> and the date it
                stops working. hrotasks@ is copied, as on the other sends.
              </p>
            </div>
          </>
        )}

        {notes.length ? (
          <ul className="mt-3 space-y-1 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : null}
        {error ? <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">{error}</p> : null}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {request && !sent ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void post({ action: "cancel", id: request.id })}
              className="mr-auto rounded border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
            >
              Cancel this link
            </button>
          ) : null}
          <button type="button" onClick={onClose} disabled={busy} className="rounded px-3 py-2 text-sm font-semibold text-brand-grey transition hover:text-brand-lea dark:text-slate-400">
            Close
          </button>
          {!sent ? (
            <button
              type="button"
              onClick={() => void post({ action: "send", id: request?.id ?? null, to, toName, departments, subject, body })}
              disabled={!canSend}
              className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-50"
            >
              {busy ? "Sending…" : `${request ? "Resend" : "Send"}${body !== null ? " edited copy" : ""} to ${to || "…"}`}
            </button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
