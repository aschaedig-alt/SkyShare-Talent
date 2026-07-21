"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileSignature, Check } from "lucide-react";
import { clsx } from "clsx";
import { OFFER_STATUSES, offerStatusLabel } from "@/lib/offers/constants";
import { OFFER_STEPS, type OfferApplicationView } from "@/lib/offers/steps";
import { formatMomentDate, formatCalendarDay } from "@/lib/dates/display";

// The candidate profile passes its full application object (a superset); the
// onboarding record passes the hire's linked offer built to this same shape.
type Application = OfferApplicationView;

// Two different kinds of date here, and they are NOT interchangeable.
//
// WHEN something happened (sent / signed / declined, and each step's timestamp)
// is a real moment, so it renders in the office timezone. It used to render in
// UTC, which meant anything done after ~6pm Mountain displayed as the NEXT day —
// sign an offer at 6:10pm on the 20th and the app told you the 21st.
//
// The START DATE is a calendar day someone picked, stored at midnight UTC, so it
// must stay in UTC or it reads back as the previous day.
const fmtMoment = (iso: string | null) => formatMomentDate(iso) || null;
const fmtDay = (iso: string | null) => formatCalendarDay(iso) || null;

const CHIP: Record<string, string> = {
  NONE: "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400",
  PLANNED: "bg-brand-sweet/25 text-brand-lea dark:text-slate-100",
  STARTED: "bg-brand-eden/20 text-brand-eden dark:bg-brand-sweet/20 dark:text-slate-100",
  SENT: "bg-brand-gold/25 text-brand-lea dark:text-slate-100",
  SIGNED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  DECLINED: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300"
};

/**
 * Sets the offer on ONE application. Deliberately dumb: it only says "this offer
 * is now X" and lets the server decide what that means. All the behaviour lives
 * in recordOfferStatus, which is why a Paycom notification arriving via Front can
 * later drive the exact same transitions without touching this component.
 */
export function OfferControl({ application, canEdit }: { application: Application; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState(application.offerDeclineReason ?? "");
  const [askReason, setAskReason] = useState(false);
  // Start date is asked for at the moment of signing, the one time it is actually
  // known. recordOfferStatus and the API have always accepted it; nothing ever
  // sent it, which is why "prefill the start date from the signed offer" on the
  // move-to-onboarding panel could never fire.
  const [startDate, setStartDate] = useState(application.offerStartDate?.slice(0, 10) ?? "");
  const [askStart, setAskStart] = useState(false);
  // Optimistic step state so ticking feels instant; the server is the truth and
  // router.refresh() reconciles.
  const [steps, setSteps] = useState<Record<string, string>>(application.offerSteps ?? {});
  const [showSteps, setShowSteps] = useState(false);

  const status = application.offerStatus ?? "NONE";
  const doneCount = OFFER_STEPS.filter((s) => steps[s.key]).length;
  // Once an offer is in flight the steps are the story, so show them. Before that
  // they stay tucked away — most applications will never become an offer.
  const stepsOpen = showSteps || (status !== "NONE" && status !== "DECLINED");

  async function toggleStep(key: string, done: boolean) {
    // Optimistic: tick it now, put it back if the server disagrees.
    const previous = steps;
    const next = { ...steps };
    if (done) next[key] = new Date().toISOString();
    else delete next[key];
    setSteps(next);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/offers/${application.id}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, done })
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; steps?: Record<string, string> };
      if (!res.ok) throw new Error(data.message || "Could not update that step.");
      if (data.steps) setSteps(data.steps);
      router.refresh();
    } catch (e) {
      setSteps(previous);
      setError(e instanceof Error ? e.message : "Could not update that step.");
    } finally {
      setBusy(false);
    }
  }

  async function set(next: string, opts?: { reason?: string; startDate?: string }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/offers/${application.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: next,
          reason: opts?.reason ?? null,
          // Only send a date when there is one — omitted means "leave it alone",
          // so re-saving a signed offer cannot wipe a date already recorded.
          ...(opts?.startDate ? { startDate: opts.startDate } : {})
        })
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message || "Could not update the offer.");
      setAskReason(false);
      setAskStart(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the offer.");
    } finally {
      setBusy(false);
    }
  }

  const dates = [
    application.offerSentAt ? `sent ${fmtMoment(application.offerSentAt)}` : null,
    application.offerSignedAt ? `signed ${fmtMoment(application.offerSignedAt)}` : null,
    application.offerDeclinedAt ? `declined ${fmtMoment(application.offerDeclinedAt)}` : null,
    application.offerStartDate ? `starts ${fmtDay(application.offerStartDate)}` : null
  ].filter(Boolean);

  return (
    <div className="mt-2 border-t border-brand-lea/10 pt-2 dark:border-white/10">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">
          <FileSignature className="h-3 w-3" />
          Offer
        </span>

        <span className={clsx("rounded px-2 py-0.5 text-[11px] font-semibold", CHIP[status] ?? CHIP.NONE)}>
          {offerStatusLabel(status)}
        </span>

        {application.offerSource && application.offerSource !== "MANUAL" ? (
          <span className="rounded bg-brand-cloudDancer/60 px-1.5 py-0.5 text-[10px] font-semibold text-brand-grey dark:bg-white/5 dark:text-slate-400">
            via {application.offerSource}
          </span>
        ) : null}

        {status !== "NONE" && (
          <span className="text-[11px] text-brand-grey dark:text-slate-400">
            {doneCount} of {OFFER_STEPS.length} steps
          </span>
        )}

        {canEdit && (
          <select
            value={status}
            disabled={busy}
            onChange={(e) => {
              const next = e.target.value;
              if (next === "DECLINED") setAskReason(true);
              // Signing is the handoff to onboarding, and the start date is the
              // one thing onboarding needs that only the offer knows.
              else if (next === "SIGNED") setAskStart(true);
              else void set(next);
            }}
            className="rounded border border-brand-lea/15 bg-white px-2 py-1 text-[11px] font-semibold text-brand-lea outline-none disabled:opacity-50 dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
          >
            {OFFER_STATUSES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}

        {/* Before an offer exists, this is the way in — you should be able to
            work an offer for someone you only MIGHT hire, without first creating a
            new-hire record. It records the intent (PLANNED) and opens the steps;
            ticking the first prep step then moves it to "started". */}
        {canEdit && !stepsOpen && (
          <button
            onClick={() => {
              setShowSteps(true);
              void set("PLANNED");
            }}
            className="rounded text-[11px] font-semibold text-brand-eden underline-offset-2 hover:underline dark:text-brand-sweet"
          >
            Start an offer
          </button>
        )}
      </div>

      {stepsOpen && (
        <ol className="mt-2 space-y-1">
          {OFFER_STEPS.map((step) => {
            const at = steps[step.key];
            const done = Boolean(at);
            return (
              <li key={step.key}>
                <button
                  onClick={() => void toggleStep(step.key, !done)}
                  disabled={!canEdit || busy}
                  className={clsx(
                    "flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] transition",
                    canEdit && "hover:bg-brand-cloudDancer/40 dark:hover:bg-white/5",
                    !canEdit && "cursor-default",
                    done ? "text-brand-lea dark:text-slate-100" : "text-brand-grey dark:text-slate-400"
                  )}
                >
                  <span
                    className={clsx(
                      "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                      done ? "border-brand-lea bg-brand-lea text-white" : "border-brand-lea/30 dark:border-white/20"
                    )}
                  >
                    {done && <Check className="h-2.5 w-2.5" />}
                  </span>
                  <span className={clsx("flex-1", done && "font-semibold")}>{step.label}</span>
                  {done && <span className="shrink-0 text-[10px] text-brand-grey dark:text-slate-500">{fmtMoment(at)}</span>}
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {/* Ticking the last step IS the handoff — say so, rather than making
          someone know that signed means "now go and do the next thing". */}
      {stepsOpen && status === "SIGNED" && (
        <p className="mt-1.5 rounded bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
          Signed — they are ready to move into onboarding.
        </p>
      )}

      {dates.length > 0 && (
        <p className="mt-1 text-[11px] text-brand-grey dark:text-slate-400">{dates.join(" · ")}</p>
      )}

      {/* Already signed but nobody recorded when they start — the offer is the
          only place that knows, and onboarding is blind without it. */}
      {canEdit && status === "SIGNED" && !application.offerStartDate && !askStart && (
        <button
          onClick={() => setAskStart(true)}
          className="mt-1 rounded text-[11px] font-semibold text-brand-eden underline-offset-2 hover:underline dark:text-brand-sweet"
        >
          Add their start date
        </button>
      )}
      {application.offerDeclineReason && status === "DECLINED" ? (
        <p className="mt-0.5 text-[11px] text-brand-grey dark:text-slate-400">Reason: {application.offerDeclineReason}</p>
      ) : null}
      {error && <p className="mt-1 text-[11px] text-red-600 dark:text-red-300">{error}</p>}

      {askStart && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="text-[11px] font-semibold text-brand-grey dark:text-slate-400">
            Start date on the offer
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded border border-brand-lea/20 px-2 py-1 text-xs outline-none focus:border-brand-lea dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
          />
          <button
            onClick={() => void set("SIGNED", { startDate })}
            disabled={busy}
            className="rounded bg-brand-lea px-3 py-1 text-xs font-semibold text-white transition hover:bg-brand-eden disabled:opacity-50"
          >
            Save
          </button>
          {/* Signing is the fact; the date is a nicety. Never block recording the
              signature because nobody knows the start date yet. */}
          <button
            onClick={() => void set("SIGNED")}
            disabled={busy}
            className="rounded px-2 py-1 text-xs font-semibold text-brand-grey transition hover:bg-brand-cloudDancer/40 disabled:opacity-50 dark:text-slate-400"
          >
            {status === "SIGNED" ? "Cancel" : "Not known yet"}
          </button>
        </div>
      )}

      {askReason && (
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why did they decline? (optional)"
            className="flex-1 rounded border border-brand-lea/20 px-2 py-1 text-xs outline-none focus:border-brand-lea dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
          />
          <button
            onClick={() => void set("DECLINED", { reason })}
            disabled={busy}
            className="rounded bg-brand-lea px-3 py-1 text-xs font-semibold text-white transition hover:bg-brand-eden disabled:opacity-50"
          >
            Save
          </button>
          <button
            onClick={() => setAskReason(false)}
            disabled={busy}
            className="rounded px-2 py-1 text-xs font-semibold text-brand-grey transition hover:bg-brand-cloudDancer/40 disabled:opacity-50 dark:text-slate-400"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
