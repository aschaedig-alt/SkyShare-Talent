import Link from "next/link";
import { Users, Bookmark } from "lucide-react";
import { CandidateViewTabs } from "@/components/candidates/CandidateViewTabs";
import { listCandidateViews } from "@/lib/data/candidate-views";
import { requireModulePageAccess } from "@/lib/data/module-access";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export default async function SavedViewsPage() {
  await requireModulePageAccess("candidates");
  const views = await listCandidateViews();

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

      {views.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {views.map((view) => (
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
                  <Users className="h-3 w-3" /> {view.candidateIds.length} · {formatDate(view.updatedAt)}
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
          <div className="mt-3 text-base font-semibold text-brand-lea dark:text-slate-100">No saved views yet</div>
          <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
            Search on the{" "}
            <Link href="/candidates" className="font-semibold underline hover:text-brand-gold">
              Records tab
            </Link>
            , tick the people you want, then choose <span className="font-semibold">Save as view</span>.
          </p>
        </section>
      )}
    </div>
  );
}
