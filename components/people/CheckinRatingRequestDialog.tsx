"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Modal } from "@/components/ui/Modal";
import { EmailBodyEditor } from "@/components/shared/EmailBodyEditor";
import { formatMomentDateShort } from "@/lib/dates/display";
import {
  RATING_LINK_DAYS,
  RATING_STATE_LABEL,
  cancelReasonText,
  defaultRatingBodyHtml,
  defaultRatingSubject,
  looksLikeEmail,
  ratingGreetingHtml,
  type RatingRecipientOption,
  type RatingRequestView
} from "@/lib/onboarding/checkin-rating-request-shared";
import { RATED_CHECKINS, ratedCheckin } from "@/lib/onboarding/checkin-rating";

// Send the hiring manager the no-login check-in rating link (90-day, 6-month or
// 12-month - the same questionnaire each time), see where it stands,
// resend it, or cancel it - all from Post-onboard (feedback cmwcq16o7).
//
// The body is EDITABLE for this send (her standing rule for every template send);
// there is no Front template behind it, so the editor says "as the app wrote it".
// The link itself is added under the body by the server and is not in the edit
// box, so no rewrite can drop it or leave an old one in.

type Recipients = { employeeName: string; options: RatingRecipientOption[]; leftReason: string | null };

const OTHER = "__other__";

export function CheckinRatingRequestDialog({
  hireId,
  hireName,
  dayMark,
  request,
  onClose,
  onChanged
}: {
  hireId: string;
  hireName: string;
  /** Which check-in: 90, 180 or 365. */
  dayMark: number;
  request: RatingRequestView | null;
  onClose: () => void;
  onChanged: (view: RatingRequestView) => void;
}) {
  const checkin = ratedCheckin(dayMark) ?? RATED_CHECKINS[0];
  const [recipients, setRecipients] = useState<Recipients | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pick, setPick] = useState<string>("");
  const [otherName, setOtherName] = useState("");
  const [otherEmail, setOtherEmail] = useState("");
  const [subject, setSubject] = useState(defaultRatingSubject(hireName, checkin.dayMark));
  const [body, setBody] = useState<string | null>(null);
  const reusable = request?.state === "PENDING" || request?.state === "EXPIRED";
  const [linkMode, setLinkMode] = useState<"same" | "new">(reusable ? "same" : "new");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [current, setCurrent] = useState<RatingRequestView | null>(request);

  useEffect(() => {
    let live = true;
    void fetch(`/api/onboarding/checkin-rating-requests?recipients=${encodeURIComponent(hireId)}&dayMark=${checkin.dayMark}`)
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as Recipients & { message?: string };
        if (!r.ok) throw new Error(d.message || "Could not load the supervisors.");
        return d;
      })
      .then((d) => {
        if (!live) return;
        setRecipients(d);
        // Default to whoever it went to last time, else the primary supervisor.
        const prior = request?.to ? d.options.find((o) => o.email.toLowerCase() === request.to.toLowerCase()) : undefined;
        if (prior) setPick(prior.email);
        else if (request?.to) {
          setPick(OTHER);
          setOtherEmail(request.to);
          setOtherName(request.toName ?? "");
        } else setPick(d.options[0]?.email ?? OTHER);
      })
      .catch((e) => live && setLoadError(e instanceof Error ? e.message : "Could not load the supervisors."));
    return () => {
      live = false;
    };
  }, [hireId, request, checkin.dayMark]);

  const chosen = recipients?.options.find((o) => o.email === pick) ?? null;
  const toEmail = pick === OTHER ? otherEmail.trim() : chosen?.email ?? "";
  const toName = pick === OTHER ? otherName.trim() || null : chosen?.name ?? null;

  const state = current?.state ?? null;
  // Completed, or cancelled because the person left: nothing left to send.
  const closed = state === "COMPLETED" || (state === "CANCELLED" && current?.cancelReason === "LEFT");
  const canSend = !closed && !recipients?.leftReason && looksLikeEmail(toEmail);

  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/checkin-rating-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hireId, dayMark: checkin.dayMark, ...payload })
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; request?: RatingRequestView; warnings?: string[] };
      if (!res.ok || !data.request) throw new Error(data.message || "That did not work.");
      setCurrent(data.request);
      setNotes(data.warnings ?? []);
      setLinkMode("same");
      onChanged(data.request);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  const send = () => post({ action: "send", to: toEmail, toName, subject, body, linkMode: reusableNow() ? linkMode : "new" });
  const cancel = () => {
    if (!confirm(`Cancel the ${checkin.short} rating request for ${hireName}? The link stops working straight away.`)) return;
    void post({ action: "cancel" });
  };
  function reusableNow() {
    return current?.state === "PENDING" || current?.state === "EXPIRED";
  }

  const label = "text-xs font-semibold text-brand-lea dark:text-slate-100";
  const field =
    "rounded border border-brand-lea/20 px-3 py-2 text-sm font-normal outline-none focus:border-brand-gold dark:border-white/10 dark:bg-brand-field dark:text-slate-100";

  return (
    <Modal open onClose={onClose} busy={busy} maxWidth="max-w-2xl" title={`${checkin.short} rating link for ${hireName}`}>
      <div className="p-5 text-left">
        <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">Ask the manager to rate {hireName}: {checkin.title}</h2>
        <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
          Emails the hiring manager a link to {hireName}&apos;s {checkin.title} form - the four core values on the 1&ndash;10 scale, how well they have learned the role, and &ldquo;would you hire again?&rdquo;. No login
          needed, it works once, for {RATING_LINK_DAYS} days, and it shows them no other ratings. When they send it, the rating appears here and the
          {checkin.short} check-in is marked done.
        </p>

        {current ? (
          <div className="mt-3 rounded border border-brand-lea/15 bg-brand-cloudDancer/40 p-3 text-xs text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
            <div className="flex flex-wrap items-center gap-2">
              <StateChip view={current} />
              <span>
                To {current.toName ? `${current.toName} (${current.to})` : current.to}
                {current.state === "PENDING" ? ` · works until ${formatMomentDateShort(current.expiresAt)}` : null}
                {current.state === "EXPIRED" ? ` · expired ${formatMomentDateShort(current.expiresAt)}` : null}
                {current.state === "COMPLETED" ? ` · rated ${formatMomentDateShort(current.completedAt)}${current.completedByName ? ` by ${current.completedByName}` : ""}` : null}
              </span>
              {reusableNow() ? (
                <button
                  type="button"
                  onClick={cancel}
                  disabled={busy}
                  className="ml-auto rounded border border-red-200 px-2 py-0.5 text-[11px] font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
                >
                  Cancel request
                </button>
              ) : null}
            </div>
            {current.state === "CANCELLED" ? <p className="mt-1.5">{cancelReasonText(current)} ({formatMomentDateShort(current.cancelledAt)}).</p> : null}
            <ul className="mt-2 space-y-0.5">
              {current.sends.map((s) => (
                <li key={s.at}>
                  {formatMomentDateShort(s.at)}: {s.newLink ? "sent" : "resent (same link)"} to {s.toName ?? s.to}
                  {s.by ? ` by ${s.by}` : ""}
                  {s.edited ? " · edited wording" : ""}
                  {s.mode !== "production" ? <span className="font-semibold text-amber-700 dark:text-amber-300"> · test send ({s.mode}), not delivered to them</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {recipients?.leftReason ? (
          <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
            {hireName} has left ({recipients.leftReason.toLowerCase()}), so there is no {checkin.short} rating to ask for.
          </p>
        ) : null}
        {loadError ? <p className="mt-3 text-sm text-red-700 dark:text-red-300">{loadError}</p> : null}

        {!closed && recipients && !recipients.leftReason ? (
          <>
            <fieldset className="mt-4">
              <legend className={label}>Send to</legend>
              <div className="mt-1.5 grid gap-1.5">
                {recipients.options.map((o) => (
                  <label key={o.email} className="inline-flex items-center gap-2 text-sm text-brand-lea dark:text-slate-100">
                    <input type="radio" name="rating-to" checked={pick === o.email} onChange={() => setPick(o.email)} className="h-4 w-4" />
                    {o.name ?? o.email}
                    <span className="text-xs text-brand-grey dark:text-slate-400">
                      {o.name ? `${o.email} · ` : ""}
                      {o.source === "supervisor" ? "supervisor" : "second supervisor"}
                    </span>
                  </label>
                ))}
                <label className="inline-flex items-center gap-2 text-sm text-brand-lea dark:text-slate-100">
                  <input type="radio" name="rating-to" checked={pick === OTHER} onChange={() => setPick(OTHER)} className="h-4 w-4" />
                  {recipients.options.length ? "Someone else" : "No supervisor on file - type who to send it to"}
                </label>
                {pick === OTHER ? (
                  <div className="ml-6 grid gap-2 sm:grid-cols-2">
                    <input value={otherName} onChange={(e) => setOtherName(e.target.value)} placeholder="Name" aria-label="Manager's name" className={field} />
                    <input value={otherEmail} onChange={(e) => setOtherEmail(e.target.value)} placeholder="name@skyshare.com" aria-label="Manager's email" className={field} />
                  </div>
                ) : null}
              </div>
            </fieldset>

            {reusableNow() ? (
              <fieldset className="mt-3">
                <legend className={label}>Link</legend>
                <div className="mt-1.5 grid gap-1 text-sm text-brand-lea dark:text-slate-100">
                  <label className="inline-flex items-center gap-2">
                    <input type="radio" name="rating-link" checked={linkMode === "same"} onChange={() => setLinkMode("same")} className="h-4 w-4" />
                    Same link as before <span className="text-xs text-brand-grey dark:text-slate-400">(works for {RATING_LINK_DAYS} more days)</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input type="radio" name="rating-link" checked={linkMode === "new"} onChange={() => setLinkMode("new")} className="h-4 w-4" />
                    A new link <span className="text-xs text-brand-grey dark:text-slate-400">(the old one stops working)</span>
                  </label>
                </div>
              </fieldset>
            ) : null}

            <label className={clsx("mt-3 grid gap-1", label)}>
              Subject
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className={field} />
            </label>

            <div className="mt-3">
              <EmailBodyEditor
                greeting={ratingGreetingHtml(toName)}
                template={defaultRatingBodyHtml(hireName, checkin.dayMark)}
                edited={body}
                onChange={setBody}
                disabled={busy}
                source="app"
                note="The rating link is added under this message when it sends, so editing the wording cannot lose it."
              />
              <p className="mt-1.5 text-xs text-brand-grey dark:text-slate-400">
                Added under the message: <span className="font-semibold text-brand-lea underline dark:text-slate-100">Rate {hireName}: {checkin.title}</span>{" "}
                and the date it stops working. hrotasks@ is copied, as on the other sends.
              </p>
            </div>
          </>
        ) : null}

        {notes.length ? (
          <ul className="mt-3 space-y-1 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : null}
        {error ? <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">{error}</p> : null}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded px-3 py-2 text-sm font-semibold text-brand-grey transition hover:text-brand-lea dark:text-slate-400">
            Close
          </button>
          {!closed && recipients && !recipients.leftReason ? (
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || !canSend}
              className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-50"
            >
              {busy ? "Sending…" : `${current ? "Resend" : "Send"}${body !== null ? " edited copy" : ""} to ${toEmail || "…"}`}
            </button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

const CHIP: Record<string, string> = {
  PENDING: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300",
  RATED_IN_APP: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300",
  EXPIRED: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300",
  CANCELLED: "border-brand-lea/15 bg-brand-cloudDancer/60 text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400"
};

/** The small status rectangle - used here and in the Post-onboard grid. */
export function StateChip({ view, className }: { view: RatingRequestView; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", CHIP[view.state], className)}>
      {view.state === "CANCELLED" && view.cancelReason === "LEFT" ? "Cancelled - left" : RATING_STATE_LABEL[view.state]}
    </span>
  );
}
