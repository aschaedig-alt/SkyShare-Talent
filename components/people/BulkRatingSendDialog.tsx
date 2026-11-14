"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Send } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { EmailBodyEditor } from "@/components/shared/EmailBodyEditor";
import { ratedCheckin } from "@/lib/onboarding/checkin-rating";
import {
  RATING_LINK_DAYS,
  defaultBulkRatingBodyHtml,
  defaultBulkRatingSubject,
  ratingGreetingHtml,
  type RatingRequestView
} from "@/lib/onboarding/checkin-rating-request-shared";

// Bulk manager check-in send (his ask, Nov 14 2026): the people ticked on
// Post-onboard, grouped by their supervisor, so each manager gets ONE email with a
// link per person. Each email keeps an editable subject and body (the standing
// rule for every send); the links are added under the body and cannot be edited
// away. Each person still gets their own link and record, so status, resend and
// cancel work per person afterwards. Nothing sends until a group's Send is pressed.

type PlanItem = { hireId: string; name: string };
type Group = { to: string; toName: string | null; items: PlanItem[] };
type Plan = { dayMark: number; groups: Group[]; skipped: Array<PlanItem & { reason: string }> };
type GroupState = { subject: string; body: string | null; busy: boolean; sentTo: string | null; error: string | null; notes: string[] };

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

  useEffect(() => {
    let live = true;
    void fetch("/api/onboarding/checkin-rating-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bulkPlan", hireIds, dayMark })
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
  }, [hireIds, dayMark]);

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
        body: JSON.stringify({ action: "bulkSend", hireIds: g.items.map((i) => i.hireId), dayMark, to: g.to, toName: g.toName, subject: s.subject, body: s.body })
      });
      const data = (await r.json().catch(() => ({}))) as { requests?: RatingRequestView[]; skipped?: Array<{ name: string; reason: string }>; warnings?: string[]; message?: string };
      if (!r.ok || !data.requests) return patch(g.to, { busy: false, error: data.message ?? "Send failed." });
      onSent(data.requests);
      patch(g.to, {
        busy: false,
        sentTo: g.toName ?? g.to,
        notes: [...(data.warnings ?? []), ...(data.skipped ?? []).map((x) => `${x.name} was left out: ${x.reason}.`)]
      });
    } catch {
      patch(g.to, { busy: false, error: "Send failed." });
    }
  }

  const anyBusy = Object.values(state).some((s) => s.busy);
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
        {loadError ? <p className="mt-3 text-sm text-red-700 dark:text-red-300">{loadError}</p> : null}
        {!plan && !loadError ? <p className="mt-4 text-sm text-brand-grey dark:text-slate-400">Working out who goes to which manager…</p> : null}

        {plan?.groups.map((g) => {
          const s = state[g.to];
          if (!s) return null;
          return (
            <section key={g.to} className="mt-4 rounded border border-brand-lea/15 p-3 dark:border-white/10">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-brand-lea dark:text-slate-100">
                  To {g.toName ?? g.to}
                  {g.toName ? <span className="ml-1 text-xs font-normal text-brand-grey dark:text-slate-400">{g.to}</span> : null}
                </h3>
                <span className="text-xs text-brand-grey dark:text-slate-400">
                  {g.items.length} {g.items.length === 1 ? "link" : "links"}: {g.items.map((i) => i.name).join(", ")}
                </span>
              </div>
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
                      greeting={ratingGreetingHtml(g.toName)}
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
                      {s.busy ? "Sending…" : `Send ${g.items.length} ${g.items.length === 1 ? "link" : "links"}${s.body !== null ? " (edited)" : ""} to ${g.toName ?? g.to}`}
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

        {plan && plan.groups.length === 0 ? <p className="mt-4 text-sm text-brand-grey dark:text-slate-400">Nobody selected can be sent this check-in right now.</p> : null}
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
