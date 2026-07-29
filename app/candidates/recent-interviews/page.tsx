import Link from "next/link";
import { clsx } from "clsx";
import { Star } from "lucide-react";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getRecentInterviews } from "@/lib/data/recent-interviews";
import { RECENT_INTERVIEW_WINDOWS, interviewOutcomeLabel, interviewOutcomeTone } from "@/lib/interviews/constants";
import { formatCalendarDayShort } from "@/lib/dates/display";
import { EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Who have I interviewed lately — the working list while a search is live.
 *
 * The window counts from the interview's own date, so a candidate falls off on
 * their own schedule rather than when the notes happened to be typed. Filtering
 * by interviewer is the point: "recent" means recent to YOU, and the default is
 * the signed-in person.
 */
export default async function RecentInterviewsPage({
  searchParams
}: {
  searchParams: Promise<{ days?: string; who?: string }>;
}) {
  const access = await requireModulePageAccess("candidates");
  const params = await searchParams;

  const requested = Number(params.days);
  const windowDays = RECENT_INTERVIEW_WINDOWS.includes(requested as never) ? requested : 30;
  // "all" is an explicit choice; no parameter means the signed-in person.
  const who = params.who === "all" ? null : (params.who ?? access.email ?? null);

  const { rows, interviewers } = await getRecentInterviews({ windowDays, interviewerEmail: who });

  const chip = "rounded border px-3 py-1.5 text-sm font-semibold transition";
  const chipOn = "border-brand-lea bg-brand-lea text-white";
  const chipOff =
    "border-brand-lea/20 text-brand-lea hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:hover:bg-white/10";

  function href(next: { days?: number; who?: string }) {
    const q = new URLSearchParams();
    q.set("days", String(next.days ?? windowDays));
    const target = next.who ?? (who ?? "all");
    if (target) q.set("who", target);
    return `/candidates/recent-interviews?${q.toString()}`;
  }

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Recent interviews</h1>
          <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
            Candidates interviewed in the last {windowDays} days, most recent first.
          </p>
        </div>
        <Link
          href="/candidates"
          className="rounded border border-brand-lea/20 px-3 py-1.5 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100"
        >
          All candidates
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {RECENT_INTERVIEW_WINDOWS.map((d) => (
          <Link key={d} href={href({ days: d })} className={clsx(chip, d === windowDays ? chipOn : chipOff)}>
            {d} days
          </Link>
        ))}
        <span className="mx-1 h-5 w-px bg-brand-lea/15 dark:bg-white/10" />
        <Link href={href({ who: "all" })} className={clsx(chip, !who ? chipOn : chipOff)}>
          Everyone
        </Link>
        {interviewers.map((i) => (
          <Link key={i.email} href={href({ who: i.email })} className={clsx(chip, who === i.email ? chipOn : chipOff)}>
            {i.name} <span className="opacity-60">({i.count})</span>
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nobody in this window"
          description={`No interviews recorded in the last ${windowDays} days${who ? " for this interviewer" : ""}. Log one from a candidate Interviews tab.`}
        />
      ) : (
        <div className="overflow-x-auto rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-brand-lea/10 text-left text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:border-white/10 dark:text-slate-400">
                <th className="px-4 py-3">Candidate</th>
                <th className="px-4 py-3">Interviewed</th>
                <th className="px-4 py-3">By</th>
                <th className="px-4 py-3">Outcome</th>
                <th className="px-4 py-3">Next step</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.interviewId} className="border-b border-brand-lea/5 last:border-0 dark:border-white/5">
                  <td className="px-4 py-3">
                    {/* A real link: this changes the whole screen. */}
                    <Link href={`/candidates/${r.candidateId}`} className="font-semibold text-brand-lea hover:text-brand-eden dark:text-slate-100">
                      {r.candidateName}
                    </Link>
                    <span className="block text-xs text-brand-grey dark:text-slate-400">
                      {[r.currentTitle, r.stage].filter(Boolean).join(" · ") || "No title recorded"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-brand-grey dark:text-slate-400">
                    {formatCalendarDayShort(r.interviewedAt)}
                    <span className="block text-xs">{r.daysAgo === 0 ? "today" : `${r.daysAgo} days ago`}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-brand-grey dark:text-slate-400">{r.interviewer ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="flex items-center gap-2">
                      {r.outcome && (
                        <span className={clsx("rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", interviewOutcomeTone(r.outcome))}>
                          {interviewOutcomeLabel(r.outcome)}
                        </span>
                      )}
                      {r.rating ? (
                        <span className="inline-flex">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star key={n} className={clsx("h-3 w-3", n <= (r.rating ?? 0) ? "fill-brand-gold text-brand-gold" : "text-brand-lea/20 dark:text-white/20")} />
                          ))}
                        </span>
                      ) : null}
                      {!r.outcome && !r.rating && <span className="text-xs text-brand-grey dark:text-slate-500">—</span>}
                    </span>
                  </td>
                  <td className="max-w-xs px-4 py-3 text-xs text-brand-lea dark:text-slate-200">
                    {r.nextStep ? (
                      <span className="rounded bg-brand-gold/15 px-2 py-1 font-medium">{r.nextStep}</span>
                    ) : (
                      <span className="text-brand-grey dark:text-slate-500">—</span>
                    )}
                  </td>
                  <td className="max-w-md px-4 py-3 text-xs text-brand-grey dark:text-slate-400">{r.excerpt || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
