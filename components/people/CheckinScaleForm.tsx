"use client";

import { useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { CORE_VALUE_NAMES } from "@/lib/interviews/scorecard";
import { VALUE_DESCRIPTIONS } from "@/lib/compliments/constants";
import {
  ROLE_PROGRESS,
  SCALE_COLORS,
  SCALE_GROUPS,
  isScore,
  missingAnswers,
  scoreWord,
  type CheckinAnswers,
  type ScoreAnswer
} from "@/lib/onboarding/checkin-rating";

// The check-in rating form body (90-day, 6-month and 12-month - the same
// questionnaire each time) - the panel-verdict design he picked on Nov 13 2026.
// ONE component for both places a rating is entered, so they cannot drift:
// the hiring manager's no-login link (components/rate/ManagerRatingForm.tsx) and
// HR's in-app dialog (components/people/CheckinRatingModal.tsx).
//
// Layout "A2": ten numbered bubbles in one line; the words sit over their groups
// (2-3, 4-5, 6-7, 8-9), and 1 and 10, which stand alone, carry their words BELOW
// the line so they have room to run inward instead of wrapping into a 30px column.
// Colors only on the value scales (red 1-3, amber 4-5, green 6-10); role progress
// and hire-again are neutral, navy with a gold edge when picked, because color on
// those would push the answer. Nothing starts picked.
//
// EVERY ANSWER IS ONE TAP, ON PURPOSE (his call, Nov 13): no box appears for a low
// score or a "No". A required explanation would make a supervisor switch to a
// higher score or "Yes" to skip it; HR follows up with whoever chose 1-3 or No.

export type CheckinFormResult = { answers: CheckinAnswers; managerName: string; notes: string };

export function CheckinScaleForm({
  employeeName,
  at,
  initial,
  initialManagerName,
  initialNotes,
  nameLabel,
  namePlaceholder,
  renderNotes,
  busy,
  error,
  submitLabel,
  footerStart,
  onSubmit
}: {
  employeeName: string;
  /** "90 days", "6 months", "12 months" - the period the role question compares against. */
  at: string;
  initial: CheckinAnswers;
  initialManagerName: string;
  initialNotes: string;
  nameLabel: string;
  namePlaceholder?: string;
  /** The in-app dialog keeps its rich-text notes box; the public link uses a plain textarea. */
  renderNotes?: (value: string, onChange: (next: string) => void) => ReactNode;
  busy: boolean;
  error: string | null;
  submitLabel: string;
  /** Extra controls at the left of the button row (the dialog's Cancel / Mark done without a rating). */
  footerStart?: ReactNode;
  onSubmit: (result: CheckinFormResult) => void;
}) {
  const [a, setA] = useState<CheckinAnswers>(initial);
  const [manager, setManager] = useState(initialManagerName);
  const [notes, setNotes] = useState(initialNotes);
  const [tried, setTried] = useState(false);
  const first = employeeName.trim().split(/\s+/)[0] || "them";
  const missing = missingAnswers(a);

  const setScore = (value: string, s: ScoreAnswer) => setA((cur) => ({ ...cur, scores: { ...cur.scores, [value]: s } }));

  function submit() {
    setTried(true);
    if (missing.length) return;
    onSubmit({ answers: a, managerName: manager, notes });
  }

  const neutral = (on: boolean) =>
    clsx(
      "flex min-h-[48px] flex-1 basis-28 flex-col items-center justify-center rounded border-2 px-3 py-1.5 text-sm font-semibold transition hover:shadow-glow",
      on ? "border-brand-gold bg-brand-lea text-white" : "border-brand-lea/15 bg-white text-brand-lea dark:border-white/10 dark:bg-brand-field dark:text-slate-100"
    );
  const field =
    "w-full rounded border border-brand-lea/20 px-3 py-2 text-sm font-normal text-brand-lea outline-none focus:border-brand-gold dark:border-white/10 dark:bg-brand-field dark:text-slate-100";
  const card = "rounded border border-brand-lea/10 bg-brand-cloudDancer/30 p-3 dark:border-white/10 dark:bg-white/5";

  return (
    <div className="grid gap-3 text-left">
      {CORE_VALUE_NAMES.map((value) => {
        const s = a.scores[value];
        const skipped = s === "SKIP";
        return (
          <section key={value} className={card} aria-label={value}>
            <div className="text-sm font-semibold text-brand-lea dark:text-slate-100">{value}</div>
            {VALUE_DESCRIPTIONS[value] ? <p className="text-xs text-brand-grey dark:text-slate-400">{VALUE_DESCRIPTIONS[value]}</p> : null}
            <p className="mt-1 text-xs font-medium text-brand-lea dark:text-slate-200">How does {first} measure up on this value?</p>

            <div className={clsx("mt-2 grid grid-cols-10 transition-opacity", skipped && "opacity-[0.35]")}>
              {SCALE_GROUPS.map((g) => (
                <div
                  key={g.label}
                  style={{ gridRow: 1, gridColumn: `${g.from} / ${g.to + 1}`, borderBottomColor: SCALE_COLORS[Math.round((g.from + g.to) / 2)].fill }}
                  className="mx-0.5 mb-1 flex items-end justify-center border-b-[3px] pb-1 text-center text-[11px] font-bold leading-tight text-brand-lea dark:text-slate-100"
                >
                  {g.from === g.to ? " " : g.label}
                </div>
              ))}
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
                const on = s === n;
                const c = SCALE_COLORS[n];
                return (
                  <button
                    key={n}
                    type="button"
                    style={{ gridRow: 2, gridColumn: n }}
                    onClick={() => setScore(value, on ? null : n)}
                    aria-pressed={on}
                    aria-label={`${value}: ${n}, ${scoreWord(n)}`}
                    className="flex h-11 items-center justify-center rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-gold"
                  >
                    <span
                      style={on ? { background: c.fill, color: c.text, borderColor: c.fill } : { background: `${c.fill}1f`, borderColor: c.fill }}
                      className={clsx(
                        "flex h-[26px] w-[26px] items-center justify-center rounded-full border-[1.5px] text-[11.5px] font-bold tabular-nums transition",
                        on ? "scale-110 ring-2 ring-brand-lea ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-brand-panel" : "text-brand-lea dark:text-slate-100"
                      )}
                    >
                      {n}
                    </span>
                  </button>
                );
              })}
              {SCALE_GROUPS.filter((g) => g.from === g.to).map((g) => (
                <div
                  key={`end-${g.label}`}
                  style={{ gridRow: 3, gridColumn: g.from === 1 ? "1 / 4" : "8 / 11" }}
                  className={clsx("pt-0.5 text-[11px] font-bold leading-tight text-brand-lea dark:text-slate-100", g.from === 1 ? "text-left" : "text-right")}
                >
                  {g.label}
                </div>
              ))}
            </div>

            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-brand-grey dark:text-slate-400">
                {skipped ? "Skipped - not seen yet" : isScore(s) ? (
                  <>
                    <b className="text-brand-lea dark:text-slate-100">{s}</b> · {scoreWord(s)}
                  </>
                ) : (
                  "Not rated yet"
                )}
              </span>
              <button
                type="button"
                onClick={() => setScore(value, skipped ? null : "SKIP")}
                aria-pressed={skipped}
                className={clsx(
                  "rounded border px-2.5 py-1 text-xs font-semibold transition",
                  skipped ? "border-brand-gold text-brand-lea dark:text-slate-100" : "border-dashed border-brand-lea/25 text-brand-grey hover:text-brand-lea dark:border-white/20 dark:text-slate-400"
                )}
              >
                Haven&apos;t seen it yet
              </button>
            </div>

          </section>
        );
      })}

      <section className={card} aria-label="Learning the role">
        <div className="text-sm font-semibold text-brand-lea dark:text-slate-100">How well has {first} learned their role so far?</div>
        <p className="text-xs text-brand-grey dark:text-slate-400">
          Their department, their duties, whatever the job needs, compared with where we would expect someone to be at {at}.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {ROLE_PROGRESS.map((p) => (
            <button key={p.key} type="button" aria-pressed={a.progress === p.key} onClick={() => setA((cur) => ({ ...cur, progress: cur.progress === p.key ? null : p.key }))} className={neutral(a.progress === p.key)}>
              {p.label}
              <span className={clsx("text-[11px] font-medium", a.progress === p.key ? "text-white/80" : "text-brand-grey dark:text-slate-400")}>{p.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={card} aria-label="Hire again">
        <div className="text-sm font-semibold text-brand-lea dark:text-slate-100">Would you hire {first} again?</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" aria-pressed={a.wouldHireAgain === true} onClick={() => setA((cur) => ({ ...cur, wouldHireAgain: cur.wouldHireAgain === true ? null : true }))} className={neutral(a.wouldHireAgain === true)}>
            Yes
          </button>
          <button type="button" aria-pressed={a.wouldHireAgain === false} onClick={() => setA((cur) => ({ ...cur, wouldHireAgain: cur.wouldHireAgain === false ? null : false }))} className={neutral(a.wouldHireAgain === false)}>
            No
          </button>
        </div>
      </section>

      {renderNotes ? (
        renderNotes(notes, setNotes)
      ) : (
        <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
          Anything else HR should know? (optional)
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} className={field} />
        </label>
      )}

      <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
        {nameLabel}
        <input value={manager} onChange={(e) => setManager(e.target.value)} maxLength={80} placeholder={namePlaceholder} className={field} />
      </label>

      {tried && missing.length ? (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <b>Still needed:</b>
          <ul className="ml-4 mt-0.5 list-disc">
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {error ? <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p> : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {footerStart}
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="rounded bg-brand-lea px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-50"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}
