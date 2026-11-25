"use client";

import Link from "next/link";
import { clsx } from "clsx";
import type { QohTracking, TrackedOffer } from "@/lib/quality-of-hire/tracking";
import { R } from "@/components/reports/report-ui";
import { formatCalendarDay } from "@/lib/dates/display";

// Quality of Hire > the tracking check - milestone 4. Every offer made since Dec 10
// needs four things on record (his wording, Nov 5): interviews logged, the recruiter,
// the hiring manager, and a reason on any declined offer. Checked on Dec 17. Before
// Dec 10 it runs over the last 30 days as practice. The rules are in
// lib/quality-of-hire/tracking.ts.
//
// It sat inside Hire quality until Nov 24 2026; it is a worklist, so it now sits on
// Recruiting > Offers, admins only (app/offers/page.tsx). The 90-day (3-month)
// ratings that were listed under it are on People > Post-onboard, in the 3-month
// column under Manager check-ins.

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
      <td data-l="Offer" className={R.td}>
        {STATUS[o.status] ?? o.status}
        <span className={clsx("block text-[11px]", R.muted)}>{formatCalendarDay(o.offerOn)}</span>
      </td>
      <td data-l="Interviews" className={R.td}>
        {/* One block, so on a phone (R.stackTable) the dates sit under the count, not beside it. */}
        <div>
          <Mark ok={o.has.interviews}>
            {o.interviews}
            <span className={clsx("ml-1 text-[11px]", R.muted)}>{o.valuesScored ? "· values rated" : "· no values"}</span>
          </Mark>
          {o.interviewList.length ? (
            <ul className={clsx("mt-1 space-y-0.5 text-[11px]", R.muted)}>
              {o.interviewList.map((i) => (
                <li key={`${i.on}-${i.type}`} className="sm:whitespace-nowrap">
                  {formatCalendarDay(i.on)} · {i.type}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </td>
      <td data-l="Recruiter" className={R.td}>
        <Mark ok={o.has.recruiter}>{o.recruiter}</Mark>
      </td>
      <td data-l="Hiring manager" className={R.td}>
        <Mark ok={o.has.hiringManager}>{o.hiringManager}</Mark>
      </td>
      <td data-l="Decline reason" className={R.td}>{o.status === "DECLINED" ? <Mark ok={o.has.reason}>{o.declineReason}</Mark> : <span className={R.muted}>—</span>}</td>
      <td data-l="Result" className={R.td}>{o.complete ? <span className={R.strong}>All four</span> : <span className={R.muted}>{4 - Object.values(o.has).filter(Boolean).length} missing</span>}</td>
    </tr>
  );
}

export function QualityOfHireTracking({ tracking }: { tracking: QohTracking }) {
  const complete = tracking.offers.filter((o) => o.complete).length;
  return (
    <section className={R.panel}>
      <p className={R.eyebrow}>Quality of Hire · HR only</p>
      <h2 className={R.title}>
        {tracking.practice ? `Tracking check, practice run - offers since ${formatCalendarDay(tracking.from)}` : `Tracking check - offers since ${formatCalendarDay(tracking.from)}`}
      </h2>
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
          <table className={clsx(R.table, "min-w-[860px]", R.stackTable)}>
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

      <p className={R.footnote}>
        3-month ratings due are on{" "}
        <Link href="/people?tab=post" className={R.link}>
          People &gt; Post-onboard
        </Link>
        , in the 3-month column under Manager check-ins.
      </p>
    </section>
  );
}
