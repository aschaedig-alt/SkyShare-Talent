import Link from "next/link";
import { Users, Bookmark, Lock } from "lucide-react";
import { CandidateViewTabs } from "@/components/candidates/CandidateViewTabs";
import { listCandidateViews } from "@/lib/data/candidate-views";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { isCandidateScopeNarrowed, visibleCandidateIdsFor } from "@/lib/data/candidates";
import { formatMomentDate } from "@/lib/dates/display";

// A saved view's updatedAt is a real instant. This renders on the server, where
// Vercel runs UTC, so an evening edit was showing tomorrow's date.
const formatDate = formatMomentDate;

export default async function SavedViewsPage() {
  const access = await requireModulePageAccess("candidates");
  const savedViews = await listCandidateViews();

  // The card's headline number is a candidate count, so it has to be scoped like
  // any other candidate read: a narrowed viewer following a card that promises
  // twelve and lands on three has been told something untrue by us. It must
  // count the same way the view itself does, which means BOTH narrowings —
  // scopeCandidateIds here counted only the allowlist, so a department-scoped
  // hiring manager was still promised the full twelve.
  //
  // A view holding nobody they may see is dropped rather than shown as zero —
  // it would be a card whose only function is to link to an empty page. Both
  // behaviours are gated on the viewer actually being narrowed, so for everyone
  // else this renders exactly what it rendered before, including a view that
  // genuinely has no members left in it.
  //
  // Resolved in ONE call over every id on the page rather than per card: the
  // department restriction costs a query, and asking per view would multiply it
  // by the number of saved views on the workspace.
  const narrowed = isCandidateScopeNarrowed(access.viewer);
  const visibleIds = new Set(
    await visibleCandidateIdsFor([...new Set(savedViews.flatMap((view) => view.candidateIds))], access.viewer)
  );
  const views = savedViews
    .map((view) => ({ view, visibleCount: view.candidateIds.filter((id) => visibleIds.has(id)).length }))
    .filter((row) => !narrowed || row.visibleCount > 0);
  const hiddenViewCount = savedViews.length - views.length;

  return (
    <div className="space-y-5 px-5 py-5 lg:px-8">
      <section className="overflow-hidden rounded bg-gradient-to-br from-brand-lea to-brand-eden p-6 shadow-panel">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Candidate operations</p>
        <h1 className="mt-0.5 text-3xl font-semibold text-white">Saved views</h1>
        <p className="mt-1 max-w-2xl text-sm text-white/75">
          Shortlists you picked by hand. Open one to work through it, or send its link to a hiring manager.
        </p>
      </section>

      <CandidateViewTabs active="views" />

      {/* Not a warning — nothing is broken — so it is styled as a quiet note. */}
      {hiddenViewCount > 0 && (
        <section className="flex items-start gap-2 rounded border border-brand-gold/40 bg-brand-cloudDancer/60 px-4 py-3 dark:border-brand-gold/30 dark:bg-brand-gold/10">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-lea dark:text-brand-gold" />
          <p className="text-xs text-brand-grey dark:text-slate-300">
            <span className="font-semibold text-brand-lea dark:text-slate-100">
              {hiddenViewCount} saved view{hiddenViewCount === 1 ? " is" : "s are"} not listed.
            </span>{" "}
            They hold no candidates you have access to. Ask a recruiter if you were expecting one of them.
          </p>
        </section>
      )}

      {views.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {views.map(({ view, visibleCount }) => (
            <li key={view.id}>
              <Link
                href={`/candidates/views/${view.id}`}
                className="flex h-full flex-col rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 transition hover:shadow-glow hover:ring-brand-gold/40 dark:bg-brand-panel dark:ring-white/10"
              >
                <span className="font-semibold text-brand-lea dark:text-slate-100">{view.name}</span>
                {view.note && (
                  <span className="mt-1 line-clamp-2 text-xs text-brand-grey dark:text-slate-400">{view.note}</span>
                )}
                <span className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-grey dark:text-slate-400">
                  <Users className="h-3 w-3" />{" "}
                  {visibleCount === view.candidateIds.length
                    ? view.candidateIds.length
                    : `${visibleCount} of ${view.candidateIds.length}`}{" "}
                  · {formatDate(view.updatedAt)}
                </span>
                {view.createdByEmail && (
                  <span className="mt-0.5 truncate text-[11px] text-brand-grey dark:text-slate-500">
                    {view.createdByEmail}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <section className="rounded bg-white p-8 text-center shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-cloudDancer/70 dark:bg-white/5">
            <Bookmark className="h-5 w-5 text-brand-grey dark:text-slate-400" />
          </div>
          {/* "No saved views yet" would flatly contradict the note above when
              views exist but none of them are this viewer's to see. */}
          <div className="mt-3 text-base font-semibold text-brand-lea dark:text-slate-100">
            {hiddenViewCount > 0 ? "Nothing to show here" : "No saved views yet"}
          </div>
          <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
            {hiddenViewCount > 0 ? (
              <>
                Every saved view is a shortlist of candidates outside your access. You can still work through the
                people you were given on the{" "}
                <Link href="/candidates" className="font-semibold underline hover:text-brand-gold">
                  Records tab
                </Link>
                .
              </>
            ) : (
              <>
                Search on the{" "}
                <Link href="/candidates" className="font-semibold underline hover:text-brand-gold">
                  Records tab
                </Link>
                , tick the people you want, then choose <span className="font-semibold">Save as view</span>.
              </>
            )}
          </p>
        </section>
      )}
    </div>
  );
}
