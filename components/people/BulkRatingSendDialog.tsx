"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Send } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { EmailBodyEditor } from "@/components/shared/EmailBodyEditor";
import { ratedCheckin } from "@/lib/onboarding/checkin-rating";
import {
  RATING_LINK_DAYS,
  defaultBulkRatingBodyHtml,
  defaultBulkRatingSubject,
  looksLikeEmail,
  ratingGreetingHtml,
  type RatingRecipientMode,
  type RatingRequestView
} from "@/lib/onboarding/checkin-rating-request-shared";

// Bulk manager check-in send (his ask, Nov 14 2026): the people ticked on
// Post-onboard, grouped by their supervisor, so each manager gets ONE email with a
// link per person. Each email keeps an editable subject and body (the standing
// rule for every send); the links are added under the body and cannot be edited
// away. Each person still gets their own link and record, so status, resend and
// cancel work per person afterwards. Nothing sends until a group's Send is pressed.

// WHO IT GOES TO (Aimee, Nov 25 2026, feedback cmwwiir1m): the first supervisor,
// the second supervisor, BOTH (each gets their own link; the two ratings are
// averaged), or one address for everybody - and "replace links already out", so
// links sent to one supervisor can be sent to another instead of everyone being
// left out. The plan is re-worked each time the choice changes; once anything has
// been sent the choice locks, so the plan and what was sent cannot drift apart.

type PlanItem = { hireId: string; name: string; extra: boolean; replacing: string | null };
type Group = { to: string; toName: string | null; items: PlanItem[] };
type Plan = { dayMark: number; groups: Group[]; skipped: Array<{ hireId: string; name: string; reason: string }> };
type GroupState = { subject: string; body: string | null; busy: boolean; sentTo: string | null; error: string | null; notes: string[] };

const MODES: Array<{ key: RatingRecipientMode; label: string; hint: string }> = [
  { key: "supervisor", label: "Their supervisor", hint: "each person's first supervisor" },
  { key: "supervisor2", label: "Their second supervisor", hint: "each person's second supervisor" },
  { key: "both", label: "Both supervisors", hint: "each gets their own link; the two scores are averaged" },
  { key: "other", label: "Someone else", hint: "one person rates everyone selected" }
];

export function BulkRatingSendDialog({
  hireIds,
  dayMark,
  onClose,
  onSent
}: {
  hireIds: string[];
  dayMark: number;
  onClose: () => void;
  onSent: (views: RatingRequestView[]) => void;
}) {
  const checkin = ratedCheckin(dayMark);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [state, setState] = useState<Record<string, GroupState>>({});
  const [mode, setMode] = useState<RatingRecipientMode>("supervisor");
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [otherName, setOtherName] = useState("");
  const [otherEmail, setOtherEmail] = useState("");
  // The typed address only counts once it looks like one, so the plan is not re-worked on every keystroke of a half-typed address.
  const otherReady = mode !== "other" || looksLikeEmail(otherEmail);
  // The name is read at send time; leaving it out here keeps typing a name from re-working the plan.
  const otherKey = mode === "other" && otherReady ? otherEmail.trim().toLowerCase() : "";
  const options = useMemo(() => ({ mode, replaceOpen, other: otherKey ? { to: otherKey, toName: null } : null }), [mode, replaceOpen, otherKey]);
  const locked = Object.values(state).some((s) => s.sentTo || s.busy);

  useEffect(() => {
    let live = true;
    if (!otherReady) {
      setPlan(null);
      return;
    }
    setLoadError(null);
    void fetch("/api/onboarding/checkin-rating-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bulkPlan", hireIds, dayMark, options })
    })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as Plan & { message?: string };
        if (!live) return;
        if (!r.ok) return setLoadError(data.message ?? "Could not work out who to send to.");
        setPlan(data);
        setState(
          Object.fromEntries(
            data.groups.map((g) => [g.to, { subject: defaultBulkRatingSubject(g.items.map((i) => i.name), dayMark), body: null, busy: false, sentTo: null, error: null, notes: [] }])
          )
        );
      })
      .catch(() => live && setLoadError("Could not work out who to send to."));
    return () => {
      live = false;
    };
  }, [hireIds, dayMark, options, otherReady]);

  function patch(to: string, p: Partial<GroupState>) {
    setState((cur) => ({ ...cur, [to]: { ...cur[to], ...p } }));
  }

  async function send(g: Group) {
    const s = state[g.to];
    patch(g.to, { busy: true, error: null });
    try {
      const r = await fetch("/api/onboarding/checkin-rating-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulkSend",
          hireIds: g.items.map((i) => i.hireId),
          dayMark,
          options: mode === "other" ? { ...options, other: { to: otherEmail.trim(), toName: otherName.trim() || null } } : options,
          to: g.to,
          toName: nameFor(g),
          subject: s.subject,
          body: s.body
        })
      });
      const data = (await r.json().catch(() => ({}))) as { requests?: RatingRequestView[]; skipped?: Array<{ name: string; reason: string }>; warnings?: string[]; message?: string };
      if (!r.ok || !data.requests) return patch(g.to, { busy: false, error: data.message ?? "Send failed." });
      onSent(data.requests);
      patch(g.to, {
        busy: false,
        sentTo: nameFor(g) ?? g.to,
        notes: [...(data.warnings ?? []), ...(data.skipped ?? []).map((x) => `${x.name} was left out: ${x.reason}.`)]
      });
    } catch {
      patch(g.to, { busy: false, error: "Send failed." });
    }
  }

  const anyBusy = Object.values(state).some((s) => s.busy);
  /** Who a group is addressed to by name - the typed name when one person rates everybody. */
  const nameFor = (g: Group) => (mode === "other" ? otherName.trim() || null : g.toName);
  const label = "text-xs font-semibold text-brand-lea dark:text-slate-100";
  const field = "rounded border border-brand-lea/20 px-3 py-2 text-sm font-normal outline-none focus:border-brand-gold dark:border-white/10 dark:bg-brand-field dark:text-slate-100";
  const title = checkin?.title ?? "check-in";

  return (
    <Modal open onClose={onClose} busy={anyBusy} maxWidth="max-w-2xl" title={`Send ${title} links`}>
      <div className="p-5 text-left">
        <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">Send the {title} to managers</h2>
        <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
          Grouped by each person&apos;s supervisor, so a manager with several people gets one email with a link for each. Each link opens that one
          person&apos;s form, needs no login, works once and for {RATING_LINK_DAYS} days. hrotasks@ is copied.
        </p>

        <fieldset className="mt-4" disabled={locked}>
          <legend className={label}>Send to</legend>
          <div className="mt-1.5 grid gap-1.5">
            {MODES.map((m) => (
              <label key={m.key} className="flex items-start gap-2 text-sm text-brand-lea dark:text-slate-100">
                <input type="radio" name="bulk-rating-to" checked={mode === m.key} onChange={() => setMode(m.key)} className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0">
                  {m.label} <span className="text-xs text-brand-grey dark:text-slate-400">- {m.hint}</span>
                </span>
              </label>
            ))}
            {mode === "other" ? (
              <div className="ml-6 grid gap-2 sm:grid-cols-2">
                <input value={otherName} onChange={(e) => setOtherName(e.target.value)} placeholder="Name" aria-label="Their name" className={field} />
                <input value={otherEmail} onChange={(e) => setOtherEmail(e.target.value)} placeholder="name@skyshare.com" aria-label="Their email" className={field} />
              </div>
            ) : null}
            <label className="mt-1 flex items-start gap-2 text-sm text-brand-lea dark:text-slate-100">
              <input type="checkbox" checked={replaceOpen} onChange={(e) => setReplaceOpen(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0">
                Replace links already out <span className="text-xs text-brand-grey dark:text-slate-400">- the old link stops working. Without this, anyone with a link waiting is left out.</span>
              </span>
            </label>
          </div>
          {locked ? <p className="mt-1.5 text-xs text-brand-grey dark:text-slate-400">Locked once a send has gone out. Close and start again to change it.</p> : null}
        </fieldset>

        {mode === "other" && !otherReady ? <p className="mt-4 text-sm text-brand-grey dark:text-slate-400">Type their email address to see who gets a link.</p> : null}
        {loadError ? <p className="mt-3 text-sm text-red-700 dark:text-red-300">{loadError}</p> : null}
        {!plan && !loadError && otherReady ? <p className="mt-4 text-sm text-brand-grey dark:text-slate-400">Working out who goes to which manager…</p> : null}

        {plan?.groups.map((g) => {
          const s = state[g.to];
          if (!s) return null;
          return (
            <section key={g.to} className="mt-4 rounded border border-brand-lea/15 p-3 dark:border-white/10">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-brand-lea dark:text-slate-100">
                  To {nameFor(g) ?? g.to}
                  {nameFor(g) ? <span className="ml-1 text-xs font-normal text-brand-grey dark:text-slate-400">{g.to}</span> : null}
                </h3>
                <span className="text-xs text-brand-grey dark:text-slate-400">
                  {g.items.length} {g.items.length === 1 ? "link" : "links"}: {g.items.map((i) => i.name).join(", ")}
                </span>
              </div>
              {g.items.some((i) => i.extra || i.replacing) ? (
                <ul className="mt-1 space-y-0.5 text-xs text-brand-grey dark:text-slate-400">
                  {g.items
                    .filter((i) => i.extra || i.replacing)
                    .map((i) => (
                      <li key={i.hireId}>
                        {i.name}: {[i.extra ? "second supervisor - averaged with the first" : null, i.replacing ? `replaces the link to ${i.replacing}` : null].filter(Boolean).join("; ")}
                      </li>
                    ))}
                </ul>
              ) : null}
              {s.sentTo ? (
                <p className="mt-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">Sent to {s.sentTo}.</p>
              ) : (
                <>
                  <label className={clsx("mt-3 grid gap-1", label)}>
                    Subject
                    <input value={s.subject} onChange={(e) => patch(g.to, { subject: e.target.value })} className={field} />
                  </label>
                  <div className="mt-3">
                    <EmailBodyEditor
                      greeting={ratingGreetingHtml(nameFor(g))}
                      template={defaultBulkRatingBodyHtml(g.items.map((i) => i.name), dayMark)}
                      edited={s.body}
                      onChange={(v) => patch(g.to, { body: v })}
                      disabled={s.busy}
                      source="app"
                      note="One link per person is added under this message when it sends, so editing the wording cannot lose them."
                    />
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => void send(g)}
                      disabled={s.busy}
                      className="inline-flex items-center gap-1.5 rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden hover:shadow-glow disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5" aria-hidden />
                      {s.busy ? "Sending…" : `Send ${g.items.length} ${g.items.length === 1 ? "link" : "links"}${s.body !== null ? " (edited)" : ""} to ${nameFor(g) ?? g.to}`}
                    </button>
                  </div>
                </>
              )}
              {s.error ? <p className="mt-2 text-sm font-medium text-red-700 dark:text-red-300">{s.error}</p> : null}
              {s.notes.length ? (
                <ul className="mt-2 space-y-1 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                  {s.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          );
        })}

        {plan && plan.groups.length === 0 ? <p className="mt-4 text-sm text-brand-grey dark:text-slate-400">Nobody selected can be sent this check-in with these choices. The list below says why for each person{replaceOpen ? "" : " - if links are already out, tick Replace links already out"}.</p> : null}
        {plan?.skipped.length ? (
          <div className="mt-4 rounded border border-brand-lea/10 bg-brand-cloudDancer/40 px-3 py-2 text-xs text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
            <div className="font-semibold text-brand-lea dark:text-slate-100">Left out ({plan.skipped.length})</div>
            <ul className="mt-1 space-y-0.5">
              {plan.skipped.map((x) => (
                <li key={x.hireId}>
                  {x.name}: {x.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onClose} disabled={anyBusy} className="rounded px-3 py-2 text-sm font-semibold text-brand-grey transition hover:text-brand-lea dark:text-slate-400">
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
