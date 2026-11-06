import Link from "next/link";
import { clsx } from "clsx";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getRecentNotes, type RecentNoteKind } from "@/lib/data/recent-notes";
import { RECENT_INTERVIEW_WINDOWS } from "@/lib/interviews/constants";
import { formatCalendarDayShort } from "@/lib/dates/display";
import { EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Every note written about a candidate lately — the master list beside Recent interviews,
 * with the same 30 / 60 / 90 day windows. Candidate notes and interview write-ups (typed
 * here or copied in from Paycom) together, one row per note, newest first. See
 * lib/data/recent-notes.ts for what counts and how private notes stay private.
 *
 * Unlike Recent interviews it opens on EVERYONE: it is the master view, and the person
 * chips narrow it.
 */
export default async function RecentNotesPage({
  searchParams
}: {
  searchParams: Promise<{ days?: string; who?: string; kind?: string }>;
}) {
  const access = await requireModulePageAccess("candidates");
  const params = await searchParams;

  const requested = Number(params.days);
  const windowDays = RECENT_INTERVIEW_WINDOWS.includes(requested as never) ? requested : 30;
  const who = params.who && params.who !== "all" ? params.who : null;
  const kind: RecentNoteKind | null = params.kind === "note" || params.kind === "interview" ? params.kind : null;

  const { rows, authors, counts } = await getRecentNotes({ windowDays, authorEmail: who, kind, viewer: access.viewer });

  const chip = "rounded border px-3 py-1.5 text-sm font-semibold transition";
  const chipOn = "border-brand-lea bg-brand-lea text-white";
  const chipOff =
    "border-brand-lea/20 text-brand-lea hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:hover:bg-white/10";

  function href(next: { days?: number; who?: string | null; kind?: RecentNoteKind | "all" }) {
    const q = new URLSearchParams();
    q.set("days", String(next.days ?? windowDays));
    const target = next.who === undefined ? who : next.who;
    if (target) q.set("who", target);
    const k = next.kind === undefined ? kind : next.kind === "all" ? null : next.kind;
    if (k) q.set("kind", k);
    return `/candidates/recent-notes?${q.toString()}`;
  }

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Recent notes</h1>
          <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
            Every note and interview write-up from the last {windowDays} days, newest first.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/candidates/recent-interviews"
            className="rounded border border-brand-lea/20 px-3 py-1.5 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100"
          >
            Recent interviews
          </Link>
          <Link
            href="/candidates/paycom-log"
            className="rounded border border-brand-lea/20 px-3 py-1.5 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100"
          >
            Paycom email log
          </Link>
          <Link
            href="/candidates"
            className="rounded border border-brand-lea/20 px-3 py-1.5 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100"
          >
            All candidates
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {RECENT_INTERVIEW_WINDOWS.map((d) => (
          <Link key={d} href={href({ days: d })} className={clsx(chip, d === windowDays ? chipOn : chipOff)}>
            {d} days
          </Link>
        ))}
        <span className="mx-1 h-5 w-px bg-brand-lea/15 dark:bg-white/10" />
        <Link href={href({ kind: "all" })} className={clsx(chip, !kind ? chipOn : chipOff)}>
          All <span className="opacity-60">({counts.note + counts.interview})</span>
        </Link>
        <Link href={href({ kind: "interview" })} className={clsx(chip, kind === "interview" ? chipOn : chipOff)}>
          Interview notes <span className="opacity-60">({counts.interview})</span>
        </Link>
        <Link href={href({ kind: "note" })} className={clsx(chip, kind === "note" ? chipOn : chipOff)}>
          Candidate notes <span className="opacity-60">({counts.note})</span>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={href({ who: null })} className={clsx(chip, !who ? chipOn : chipOff)}>
          Everyone
        </Link>
        {authors.map((a) => (
          <Link key={a.email} href={href({ who: a.email })} className={clsx(chip, who === a.email ? chipOn : chipOff)}>
            {a.name} <span className="opacity-60">({a.count})</span>
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No notes in this window"
          description={`Nothing was written in the last ${windowDays} days${who ? " by this person" : ""}${kind ? " of this kind" : ""}.`}
        />
      ) : (
        <div className="overflow-x-auto rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-brand-lea/10 text-left text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:border-white/10 dark:text-slate-400">
                <th className="px-4 py-3">Candidate</th>
                <th className="px-4 py-3">Written</th>
                <th className="px-4 py-3">Kind</th>
                <th className="px-4 py-3">By</th>
                <th className="px-4 py-3">Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-brand-lea/5 last:border-0 dark:border-white/5">
                  <td className="px-4 py-3">
                    {/* A real link: this changes the whole screen. */}
                    <Link href={`/candidates/${r.candidateId}`} className="font-semibold text-brand-lea hover:text-brand-eden dark:text-slate-100">
                      {r.candidateName}
                    </Link>
                    <span className="block text-xs text-brand-grey dark:text-slate-400">{r.stage || "No stage recorded"}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-brand-grey dark:text-slate-400">
                    {formatCalendarDayShort(r.writtenAt)}
                    <span className="block text-xs">{r.daysAgo === 0 ? "today" : `${r.daysAgo} days ago`}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="rounded bg-brand-sweet/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-lea dark:text-slate-100">
                      {r.label}
                    </span>
                    {r.fromPaycom ? <span className="mt-1 block text-[10px] font-semibold text-brand-grey dark:text-slate-400">From Paycom</span> : null}
                    {r.hrOnly ? <span className="mt-1 block text-[10px] font-semibold text-brand-grey dark:text-slate-400">HR only</span> : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-brand-grey dark:text-slate-400">{r.author ?? "—"}</td>
                  <td className="max-w-xl px-4 py-3 text-xs text-brand-grey dark:text-slate-400">
                    {r.title ? <span className="block font-semibold text-brand-lea dark:text-slate-100">{r.title}</span> : null}
                    {r.excerpt || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
