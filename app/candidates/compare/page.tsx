import Link from "next/link";
import { BarChart3, Lock, Users } from "lucide-react";
import { CandidateComparison } from "@/components/candidates/CandidateComparison";
import { CandidateViewTabs } from "@/components/candidates/CandidateViewTabs";
import { SavedViewHeader } from "@/components/candidates/SavedViewHeader";
import {
  getCandidateComparisonData,
  isCandidateScopeNarrowed,
  visibleCandidateIdsFor
} from "@/lib/data/candidates";
import { getCandidateView, listCandidateViews } from "@/lib/data/candidate-views";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { isAdminOrRecruiter } from "@/lib/auth/roles";

type ComparePageProps = {
  searchParams?: Promise<{ view?: string }>;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export default async function CandidateComparePage({ searchParams }: ComparePageProps) {
  const access = await requireModulePageAccess("candidates");
  const params = await searchParams;
  const viewId = params?.view?.trim() || null;

  const view = viewId ? await getCandidateView(viewId) : null;
  // The viewer matters on BOTH branches: with a view it narrows the saved ids,
  // and without one it narrows the "everybody" fallback, which otherwise loads
  // up to 1000 candidates straight into an allowlisted viewer's table.
  const data = await getCandidateComparisonData(view ? view.candidateIds : undefined, access.viewer);
  const savedViews = view ? [] : await listCandidateViews();
  const canEdit = isAdminOrRecruiter(access.role);

  // Two different reasons a saved view can render short, and they must not be
  // reported as one. Members held back by this viewer's access are not missing
  // data, so subtract them before counting the gap — otherwise the header below
  // tells a restricted viewer that people who are alive and well were "deleted
  // or merged". They get their own note instead.
  //
  // visibleCandidateIdsFor applies BOTH narrowings, the way the comparison query
  // itself does. scopeCandidateIds here read the allowlist only and returned the
  // ids untouched for a department-scoped hiring manager, which dropped every
  // out-of-department member into missingCount and fired the amber panel at them.
  const visibleIds = view ? await visibleCandidateIdsFor(view.candidateIds, access.viewer) : [];
  const withheldCount = view ? view.candidateIds.length - visibleIds.length : 0;
  // A saved view stores ids; a candidate can be deleted or merged away later.
  // What is left after the scoping and still did not come back is that, and only
  // that. Count it so the page can say so rather than quietly showing fewer
  // people.
  const missingCount = view ? visibleIds.length - data.rows.length : 0;

  // The index at the bottom of this page carries the same per-view candidate
  // counts as /candidates/views, so it has to be scoped the same way — two
  // pages disagreeing about how big a view is, with the unscoped one wrong, is
  // how somebody ends up chasing a person they were never given. Views with
  // nobody visible drop out for the same reason they do there: the card would
  // only ever link to an empty page. Both are no-ops unless the viewer is
  // actually narrowed, by either mechanism.
  //
  // Resolved in ONE call over every id on the page rather than per card: the
  // department restriction costs a query, and asking per view would multiply it
  // by the number of saved views on the workspace.
  const narrowed = isCandidateScopeNarrowed(access.viewer);
  const visibleSavedIds = new Set(
    await visibleCandidateIdsFor([...new Set(savedViews.flatMap((saved) => saved.candidateIds))], access.viewer)
  );
  const savedViewCards = savedViews
    .map((saved) => ({ saved, visibleCount: saved.candidateIds.filter((id) => visibleSavedIds.has(id)).length }))
    .filter((row) => !narrowed || row.visibleCount > 0);

  return (
    <div className="space-y-5 px-5 py-5 lg:px-8">
      {/* Header */}
      <section className="overflow-hidden rounded bg-gradient-to-br from-brand-lea to-brand-eden p-6 shadow-panel">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Candidate operations</p>
        <h1 className="mt-0.5 text-3xl font-semibold text-white">
          {view ? view.name : "Compare candidates"}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-white/75">
          {view
            ? "A saved shortlist. Click a column to sort; filter by rating or certificate. Everything shown is live — stages and notes update as the team works."
            : "Compare flight time, type ratings, and certificates across everyone in one sortable table. Click a column to sort; filter by rating or certificate; export the current view to CSV."}
        </p>
      </section>

      <CandidateViewTabs active="compare" />

      {viewId && !view && (
        <section className="rounded border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/15">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            That saved view no longer exists.
          </p>
          <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-300/80">
            It may have been deleted. Showing every candidate instead —{" "}
            <Link href="/candidates" className="underline">
              go back to the list
            </Link>{" "}
            to build a new one.
          </p>
        </section>
      )}

      {view && (
        <SavedViewHeader
          viewId={view.id}
          name={view.name}
          note={view.note}
          count={data.rows.length}
          missingCount={missingCount}
          createdByEmail={view.createdByEmail}
          canEdit={canEdit}
        />
      )}

      {/* Not a warning — nothing is broken — so it is styled as a quiet note
          rather than borrowing the amber "something went wrong" panel above. */}
      {view && withheldCount > 0 && (
        <section className="flex items-start gap-2 rounded border border-brand-gold/40 bg-brand-cloudDancer/60 px-4 py-3 dark:border-brand-gold/30 dark:bg-brand-gold/10">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-lea dark:text-brand-gold" />
          <p className="text-xs text-brand-grey dark:text-slate-300">
            <span className="font-semibold text-brand-lea dark:text-slate-100">
              Showing {data.rows.length} of {view.candidateIds.length} saved.
            </span>{" "}
            {/* Names the withheld number rather than saying "the rest", which
                would also claim credit for anyone deleted or merged away — the
                header above counts those, and they are a different problem. */}
            {withheldCount} of them {withheldCount === 1 ? "is" : "are"} outside your candidate access. Ask a recruiter
            if you need to see them.
          </p>
        </section>
      )}

      <CandidateComparison data={data} />

      {/* Saved views index. Only when looking at everyone — inside a view the
          header above already carries the context, and a list of sibling views
          under a shortlist you sent to a hiring manager is noise for them. */}
      {!view && (
        <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-brand-lea dark:text-slate-100" />
            <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Saved views</h2>
          </div>
          {savedViewCards.length > 0 ? (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {savedViewCards.map(({ saved, visibleCount }) => (
                <li key={saved.id}>
                  <Link
                    href={`/candidates/views/${saved.id}`}
                    className="flex h-full flex-col rounded border border-brand-lea/10 bg-brand-cloudDancer/40 px-4 py-3 transition hover:shadow-glow hover:ring-1 hover:ring-brand-gold/40 dark:border-white/10 dark:bg-white/5"
                  >
                    <span className="font-semibold text-brand-lea dark:text-slate-100">{saved.name}</span>
                    {saved.note && (
                      <span className="mt-0.5 line-clamp-2 text-xs text-brand-grey dark:text-slate-400">{saved.note}</span>
                    )}
                    <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-brand-grey dark:text-slate-400">
                      <Users className="h-3 w-3" />{" "}
                      {visibleCount === saved.candidateIds.length
                        ? saved.candidateIds.length
                        : `${visibleCount} of ${saved.candidateIds.length}`}{" "}
                      · {formatDate(saved.updatedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : savedViews.length > 0 ? (
            <p className="mt-2 text-sm text-brand-grey dark:text-slate-400">
              The saved views on this workspace are shortlists of candidates outside your access, so none are listed
              here.
            </p>
          ) : (
            <p className="mt-2 text-sm text-brand-grey dark:text-slate-400">
              No saved views yet. Search on the{" "}
              <Link href="/candidates" className="font-semibold underline hover:text-brand-gold">
                Records tab
              </Link>
              , tick the people you want, and choose <span className="font-semibold">Save as view</span>.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
