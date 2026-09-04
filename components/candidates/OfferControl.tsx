"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileSignature, Check, Ban } from "lucide-react";
import { clsx } from "clsx";
import { OFFER_STATUSES, offerStatusLabel } from "@/lib/offers/constants";
import { OFFER_STEPS, lastOfferStepDone, type OfferApplicationView } from "@/lib/offers/steps";
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
  DECLINED: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  // Deliberately NOT red. Red is the candidate saying no; this is our own
  // approval stopping, and the person it is attached to did nothing wrong.
  NOT_SENT: "bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300"
};

// The two endings that want a "why", and the wording each one asks for. The
// question is genuinely different: one asks about them, one asks about us.
const REASON_PROMPT: Record<string, { placeholder: string; suggestions: string[] }> = {
  DECLINED: {
    placeholder: "Why did they decline? (optional)",
    suggestions: ["Took another offer", "Pay", "Schedule or base", "Stayed with current employer"]
  },
  NOT_SENT: {
    placeholder: "Why was it never sent? (optional)",
    suggestions: ["President did not approve", "Supervisor did not approve", "Position was pulled", "Put on hold"]
  }
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
  const [reason, setReason] = useState(application.offerDeclineReason ?? application.offerNotSentReason ?? "");
  // Which ending we are asking about: "DECLINED", "NOT_SENT", or null for "not
  // asking". It used to be a boolean, which could only ever mean declined.
  const [askReason, setAskReason] = useState<string | null>(null);
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
  //
  // A DECLINED offer hides them: it ran its course and the ending was theirs. A
  // NOT_SENT one keeps them OPEN, because there the ticks ARE the record — how
  // far the offer actually got before it stopped, which is the one thing a
  // reader needs later and cannot reconstruct from the status alone.
  const stepsOpen = showSteps || (status !== "NONE" && status !== "DECLINED");
  const stalledAt = status === "NOT_SENT" ? lastOfferStepDone(steps) : null;

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
      setAskReason(null);
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
    application.offerNotSentAt ? `stopped ${fmtMoment(application.offerNotSentAt)}` : null,
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
              // Both endings ask for a why before they are recorded. An offer
              // that simply stops, with nothing saying why, is precisely what
              // nobody can reconstruct six months later.
              if (next === "DECLINED" || next === "NOT_SENT") setAskReason(next);
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

      {/* Says the quiet part out loud: they did not turn us down. Worth the two
          lines, because a bare closed status reads as "did not work out", and
          this is often someone to go straight back to when the seat reopens. */}
      {status === "NOT_SENT" && (
        <div className="mt-1.5 rounded border border-slate-300/70 bg-slate-100 px-2 py-1.5 dark:border-white/10 dark:bg-white/5">
          <p className="flex items-start gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
            <Ban className="mt-px h-3 w-3 shrink-0" />
            <span>
              Never sent — the candidate did not decline.
              {stalledAt ? ` Got as far as "${stalledAt.label}".` : null}
            </span>
          </p>
          {application.offerNotSentReason ? (
            <p className="mt-0.5 pl-[1.125rem] text-[11px] text-brand-grey dark:text-slate-400">
              {application.offerNotSentReason}
            </p>
          ) : null}
        </div>
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
        <div className="mt-2 space-y-1.5">
          <div className="flex flex-wrap gap-2">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={REASON_PROMPT[askReason]?.placeholder ?? "Why? (optional)"}
              className="min-w-[12rem] flex-1 rounded border border-brand-lea/20 px-2 py-1 text-xs outline-none focus:border-brand-lea dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
            />
            <button
              onClick={() => void set(askReason, { reason })}
              disabled={busy}
              className="rounded bg-brand-lea px-3 py-1 text-xs font-semibold text-white transition hover:bg-brand-eden disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => setAskReason(null)}
              disabled={busy}
              className="rounded px-2 py-1 text-xs font-semibold text-brand-grey transition hover:bg-brand-cloudDancer/40 disabled:opacity-50 dark:text-slate-400"
            >
              Cancel
            </button>
          </div>
          {/* A reason is only useful if it is written the same way twice — one
              click beats four people typing four spellings of the same thing. */}
          <div className="flex flex-wrap gap-1">
            {(REASON_PROMPT[askReason]?.suggestions ?? []).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setReason(s)}
                className={clsx(
                  "rounded border px-1.5 py-0.5 text-[10px] font-semibold transition",
                  reason === s
                    ? "border-brand-lea bg-brand-lea text-white dark:border-brand-gold dark:bg-brand-gold dark:text-brand-black"
                    : "border-brand-lea/20 text-brand-grey hover:shadow-glow dark:border-white/15 dark:text-slate-400"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
