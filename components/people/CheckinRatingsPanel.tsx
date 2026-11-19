"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { CORE_VALUE_NAMES } from "@/lib/interviews/scorecard";
import { RATED_CHECKINS, ROLE_PROGRESS_LABEL, anytimeDayMarkFor, isAnytimeDayMark, ratedCheckin } from "@/lib/onboarding/checkin-rating";
import type { RatingRequestView } from "@/lib/onboarding/checkin-rating-request-shared";
import type { CheckinRow } from "@/lib/quality-of-hire/checkins";
import { Score, SHORT } from "@/components/reports/CheckinReport";
import { CheckinRatingRequestDialog, StateChip } from "@/components/people/CheckinRatingRequestDialog";
import { formatMomentDate, formatMomentDateShort } from "@/lib/dates/display";
import { buttonClasses } from "@/components/ui/Button";

// The profile's Check-ins tab (his call, Nov 17 2026: "Yes, on the profile"). One
// card per check-in - 3, 6 and 12 months - so a person's ratings stay visible after
// they leave Post-onboard. Admins only: the page loads the ratings for admins and
// does not render this tab for anyone else (managers' notes about the person).
//
// ANYTIME CHECK-INS (his ask, Nov 19 2026): past their first year HR can send the
// manager the same check-in at any time from here - "Send a check-in" - and each one
// is listed under its tenure ("Check-in at 1 year 7 months"). Rules in
// lib/onboarding/checkin-rating.ts (ANYTIME_BASE).

const STATUS_WORD: Record<string, string> = { TODO: "Not rated yet", NA: "Marked not needed", DONE: "Ticked done without a rating" };
const OPEN = new Set(["PENDING", "EXPIRED"]);

function RatingBody({ r }: { r: CheckinRow }) {
  return (
    <>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {CORE_VALUE_NAMES.map((v, i) => (
          <div key={v} className="min-w-0">
            <span className="mb-0.5 hidden truncate text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey sm:block dark:text-slate-400">{SHORT[i]}</span>
            <Score value={r.scores[i]} band={r.legacyBands?.[i] ?? null} label={SHORT[i]} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        <span className={clsx("rounded border px-1.5 py-0.5 font-semibold", r.progress === "BEHIND" ? "border-red-600/60 text-red-700 dark:border-red-400/50 dark:text-red-300" : "border-brand-lea/15 text-brand-grey dark:border-white/10 dark:text-slate-400")}>
          Role: {r.progress ? ROLE_PROGRESS_LABEL[r.progress] : "—"}
        </span>
        <span className={clsx("rounded border px-1.5 py-0.5 font-semibold", r.hireAgain === false ? "border-red-600/60 text-red-700 dark:border-red-400/50 dark:text-red-300" : "border-brand-lea/15 text-brand-grey dark:border-white/10 dark:text-slate-400")}>
          {r.hireAgain === null ? "Hire again: —" : r.hireAgain ? "Would hire again" : "Would not hire again"}
        </span>
        {r.followUp.length ? <span className="font-semibold text-red-700 dark:text-red-300">For HR to talk to: {r.followUp.join(", ")}</span> : null}
      </div>
      {r.note ? (
        <p className="mt-2 whitespace-pre-line rounded border border-brand-lea/10 bg-brand-cloudDancer/45 px-3 py-2 text-sm text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">{r.note}</p>
      ) : null}
    </>
  );
}

function Card({ title, right, children }: { title: string; right: string; children?: React.ReactNode }) {
  return (
    <div className="rounded border border-brand-lea/10 bg-white p-3 dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm font-semibold text-brand-lea dark:text-slate-100">{title}</span>
        <span className="text-[11px] text-brand-grey dark:text-slate-400">{right}</span>
      </div>
      {children}
    </div>
  );
}

const ratedLine = (r: CheckinRow) => [r.ratedBy ? `Rated by ${r.ratedBy}` : null, formatMomentDate(r.ratedOn)].filter(Boolean).join(" · ");

export function CheckinRatingsPanel({
  ratings,
  tasks,
  hireId,
  hireName,
  startDate,
  gone
}: {
  ratings: CheckinRow[];
  tasks: { key: string; status: string }[];
  hireId: string;
  hireName: string;
  startDate: string | null;
  /** Terminated or cancelled: no new check-in can be sent. */
  gone: boolean;
}) {
  const [requests, setRequests] = useState<RatingRequestView[]>([]);
  const [dialog, setDialog] = useState<{ dayMark: number; request: RatingRequestView | null } | null>(null);
  const anytimeMark = anytimeDayMarkFor(startDate);
  const anytimeRatings = ratings.filter((r) => isAnytimeDayMark(r.dayMark)).sort((a, b) => b.dayMark - a.dayMark);
  const openAnytime = requests.filter((q) => isAnytimeDayMark(q.dayMark) && OPEN.has(q.state)).sort((a, b) => b.dayMark - a.dayMark);

  // The links already sent for this person, so a waiting one shows (and can be
  // resent or cancelled) instead of a second link going out beside it.
  useEffect(() => {
    let live = true;
    void fetch(`/api/onboarding/checkin-rating-requests?ids=${encodeURIComponent(hireId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { requests?: RatingRequestView[] } | null) => {
        if (live && d?.requests) setRequests(d.requests.filter((q) => q.hireId === hireId));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [hireId]);

  const button = "rounded border border-brand-lea/20 px-2.5 py-1 text-xs font-semibold text-brand-lea transition hover:shadow-glow disabled:opacity-50 dark:border-white/10 dark:text-slate-100";

  return (
    <div className="space-y-3">
      <p className="text-sm text-brand-grey dark:text-slate-400">
        The hiring manager&apos;s 1 to 10 on each core value at 3, 6 and 12 months, how well they have learned the role, and whether they would hire them again. Ratings are
        entered on People &gt; Post-onboard or through the manager&apos;s emailed link. Visible to admins only.
      </p>
      {RATED_CHECKINS.map((c) => {
        const r = ratings.find((x) => x.dayMark === c.dayMark);
        const task = tasks.find((t) => t.key === c.taskKey);
        return (
          <Card key={c.dayMark} title={c.title} right={r ? ratedLine(r) : task ? (STATUS_WORD[task.status] ?? task.status) : "Not on this checklist"}>
            {r ? <RatingBody r={r} /> : null}
          </Card>
        );
      })}

      <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/40 p-3 dark:border-white/10 dark:bg-white/5">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-brand-lea dark:text-slate-100">Anytime check-ins</div>
          <p className="text-[11px] text-brand-grey dark:text-slate-400">
            After the first year, send the manager the same check-in whenever you want one. It is named for how long {hireName} has been here when it goes out.
          </p>
        </div>
        {/* The send button sits on its own row, under the text you read first, in
            the gold call-to-action style. It used to be a small outlined button at
            the far right of the heading row, and he could not find it (Nov 19 2026:
            "i dont see a way to send it to someone"). Full width on a phone. */}
        {anytimeMark !== null && !gone && openAnytime.length === 0 && !ratings.some((r) => r.dayMark === anytimeMark) ? (
          <button
            type="button"
            className={buttonClasses({ variant: "gold", className: "mt-3 w-full sm:w-auto" })}
            onClick={() => setDialog({ dayMark: anytimeMark, request: null })}
          >
            Send a check-in to the manager ({ratedCheckin(anytimeMark)?.short})
          </button>
        ) : null}
        {gone ? (
          <p className="mt-2 text-[11px] text-brand-grey dark:text-slate-400">{hireName} has left, so no new check-in can be sent.</p>
        ) : anytimeMark !== null && ratings.some((r) => r.dayMark === anytimeMark) ? (
          <p className="mt-2 text-[11px] text-brand-grey dark:text-slate-400">This month&apos;s check-in ({ratedCheckin(anytimeMark)?.short}) is already rated. The next one can go out next month.</p>
        ) : anytimeMark === null ? (
          <p className="mt-2 text-[11px] text-brand-grey dark:text-slate-400">
            {startDate ? `Available once ${hireName} passes their first year; until then use the 3-, 6- and 12-month check-ins.` : "Needs a start date first."}
          </p>
        ) : null}
        {openAnytime.map((q) => (
          <div key={`${q.hireId}-${q.dayMark}`} className="mt-2 flex flex-wrap items-center gap-2 text-xs text-brand-grey dark:text-slate-300">
            <StateChip view={q} />
            <span className="min-w-0">
              {ratedCheckin(q.dayMark)?.title}: link sent {formatMomentDateShort(q.lastSentAt)} to {q.toName ?? q.to}
              {q.state === "EXPIRED" ? `, expired ${formatMomentDateShort(q.expiresAt)}` : `, works until ${formatMomentDateShort(q.expiresAt)}`}
            </span>
            <button type="button" className={clsx(button, "ml-auto")} onClick={() => setDialog({ dayMark: q.dayMark, request: q })}>
              Resend or cancel
            </button>
          </div>
        ))}
        {anytimeRatings.length ? (
          <div className="mt-3 space-y-3">
            {anytimeRatings.map((r) => (
              <Card key={r.id} title={ratedCheckin(r.dayMark)?.title ?? "Check-in"} right={ratedLine(r)}>
                <RatingBody r={r} />
              </Card>
            ))}
          </div>
        ) : null}
      </div>

      {dialog ? (
        <CheckinRatingRequestDialog
          hireId={hireId}
          hireName={hireName}
          dayMark={dialog.dayMark}
          request={dialog.request}
          onClose={() => setDialog(null)}
          onChanged={(view) => setRequests((cur) => [...cur.filter((q) => !(q.hireId === view.hireId && q.dayMark === view.dayMark)), view])}
        />
      ) : null}
    </div>
  );
}
