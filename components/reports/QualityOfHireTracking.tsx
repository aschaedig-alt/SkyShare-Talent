"use client";

import Link from "next/link";
import { useState } from "react";
import { clsx } from "clsx";
import type { QohTracking, RatingDue, TrackedOffer } from "@/lib/quality-of-hire/tracking";
import { CheckinRatingModal } from "@/components/people/CheckinRatingModal";
import { R } from "@/components/reports/report-ui";
import { formatCalendarDay } from "@/lib/dates/display";

// Quality of Hire > the tracking check - milestone 4. Every offer made since Dec 10
// needs four things on record (his wording, Nov 5): interviews logged, the recruiter,
// the hiring manager, and a reason on any declined offer. Checked on Dec 17. Before
// Dec 10 it runs over the last 30 days as practice. The rules are in
// lib/quality-of-hire/tracking.ts.

const STATUS: Record<string, string> = { SENT: "Sent", SIGNED: "Signed", DECLINED: "Declined" };

function Mark({ ok, children }: { ok: boolean; children?: React.ReactNode }) {
  return ok ? (
    <span className="text-brand-lea dark:text-slate-100">{children ?? "✓"}</span>
  ) : (
    <span className={clsx(R.chip, "border-brand-gold/60 text-brand-lea dark:text-slate-100")}>missing</span>
  );
}

function Row({ o }: { o: TrackedOffer }) {
  return (
    <tr className={clsx(R.tr, !o.complete && "bg-brand-gold/5")}>
      <td className={R.td}>
        <Link href={`/candidates/${o.candidateId}`} className={R.link}>
          {o.candidate}
        </Link>
        <span className={clsx("block text-[11px]", R.muted)}>{o.job ?? "—"}</span>
      </td>
      <td className={R.td}>
        {STATUS[o.status] ?? o.status}
        <span className={clsx("block text-[11px]", R.muted)}>{formatCalendarDay(o.offerOn)}</span>
      </td>
      <td className={R.td}>
        <Mark ok={o.has.interviews}>
          {o.interviews}
          <span className={clsx("ml-1 text-[11px]", R.muted)}>{o.valuesScored ? "· values rated" : "· no values"}</span>
        </Mark>
        {o.interviewList.length ? (
          <ul className={clsx("mt-1 space-y-0.5 text-[11px]", R.muted)}>
            {o.interviewList.map((i) => (
              <li key={`${i.on}-${i.type}`} className="whitespace-nowrap">
                {formatCalendarDay(i.on)} · {i.type}
              </li>
            ))}
          </ul>
        ) : null}
      </td>
      <td className={R.td}>
        <Mark ok={o.has.recruiter}>{o.recruiter}</Mark>
      </td>
      <td className={R.td}>
        <Mark ok={o.has.hiringManager}>{o.hiringManager}</Mark>
      </td>
      <td className={R.td}>{o.status === "DECLINED" ? <Mark ok={o.has.reason}>{o.declineReason}</Mark> : <span className={R.muted}>—</span>}</td>
      <td className={R.td}>{o.complete ? <span className={R.strong}>All four</span> : <span className={R.muted}>{4 - Object.values(o.has).filter(Boolean).length} missing</span>}</td>
    </tr>
  );
}

export function QualityOfHireTracking({ tracking }: { tracking: QohTracking }) {
  const complete = tracking.offers.filter((o) => o.complete).length;
  // Rated from here as well as from People > Post-onboard: this list is where he
  // looked for it (test run, Nov 11). A saved rating drops the person off the list.
  const [due, setDue] = useState<RatingDue[]>(tracking.ratingsDue);
  const [rating, setRating] = useState<RatingDue | null>(null);
  return (
    <div className={R.box}>
      <div className={R.sectionLabel}>
        {tracking.practice ? `Tracking check, practice run - offers since ${formatCalendarDay(tracking.from)}` : `Tracking check - offers since ${formatCalendarDay(tracking.from)}`}
      </div>
      <p className={R.footnote}>
        Every offer made needs four things on record: interviews logged (ideally with the core values rated), the recruiter, the hiring manager, and a reason
        if it was declined.{" "}
        {tracking.practice
          ? "Tracking starts Dec 10 and is checked Dec 17; until then this shows the last 30 days, so gaps can be fixed before it counts."
          : "Checked Dec 17: every offer here should say All four."}
      </p>
      <div className={R.note}>
        <span className={R.strong}>
          {complete} of {tracking.offers.length}
        </span>{" "}
        offers have all four.{" "}
        {tracking.offers.length - complete > 0 ? "Open the candidate and fill the gaps on their Offers tab." : null}
      </div>
      {tracking.offers.length ? (
        <div className={R.tableWrap}>
          <table className={clsx(R.table, "min-w-[860px]")}>
            <thead className={R.thead}>
              <tr>
                <th className={R.th}>Candidate</th>
                <th className={R.th}>Offer</th>
                <th className={R.th}>Interviews</th>
                <th className={R.th}>Recruiter</th>
                <th className={R.th}>Hiring manager</th>
                <th className={R.th}>Decline reason</th>
                <th className={R.th}>Result</th>
              </tr>
            </thead>
            <tbody className={R.tbody}>
              {tracking.offers.map((o) => (
                <Row key={o.applicationId} o={o} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={R.footnote}>No offers made in this window yet.</p>
      )}

      <div className={clsx(R.sectionLabel, "mt-5")}>90-day ratings due - {due.length}</div>
      <p className={R.footnote}>
        People past day 90 with no rating yet. Click Rate and enter the hiring manager&apos;s answers. The same rating is on People &gt; Post-onboard, in the Values column.
      </p>
      {due.length ? (
        <ul className="mt-2 divide-y divide-brand-lea/10 dark:divide-white/10">
          {due.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
              <Link href={`/people/${p.id}`} className={R.link}>
                {p.name}
              </Link>
              <span className="flex items-center gap-3">
                <span className={R.muted}>
                  started {formatCalendarDay(p.startDate)} · day {p.day}
                </span>
                <button
                  type="button"
                  onClick={() => setRating(p)}
                  className="rounded border border-brand-lea/20 px-2.5 py-0.5 text-[11px] font-semibold text-brand-lea transition hover:shadow-glow dark:border-white/10 dark:text-slate-100"
                >
                  Rate
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {rating ? (
        <CheckinRatingModal
          open
          name={rating.name}
          newHireId={rating.id}
          initial={null}
          onClose={() => setRating(null)}
          onSaved={() => {
            setDue((cur) => cur.filter((p) => p.id !== rating.id));
            setRating(null);
          }}
        />
      ) : null}
    </div>
  );
}
