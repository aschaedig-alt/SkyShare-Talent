import type { DuplicateReviewData } from "@/lib/data/duplicate-review";
import { CandidateDuplicateScanCard } from "@/components/duplicate-review/CandidateDuplicateScanCard";
import { JobDuplicateScanCard } from "@/components/duplicate-review/JobDuplicateScanCard";
import { DuplicateReviewQueue } from "@/components/duplicate-review/DuplicateReviewQueue";

type DuplicateReviewWorkspaceProps = {
  data: DuplicateReviewData;
};

const statLabels: Array<[keyof DuplicateReviewData["stats"], string]> = [
  ["open", "Open reviews"],
  ["candidate", "Candidate"],
  ["job", "Job"],
  ["file", "File"],
  ["resolved", "Resolved"]
];

export function DuplicateReviewWorkspace({ data }: DuplicateReviewWorkspaceProps) {
  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">
          Review control
        </p>
        <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Duplicate Review</h1>
        <p className="mt-1 max-w-3xl text-sm text-brand-grey dark:text-slate-400">
          Central review queue for candidate duplicates, job variants, file assignment, and import exceptions.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {statLabels.map(([key, label]) => (
          <div key={key} className="rounded bg-white p-3 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-grey dark:text-slate-400">{label}</div>
            <div className="mt-1 text-xl font-semibold text-brand-lea dark:text-slate-100">{data.stats[key]}</div>
            <div className="mt-2 h-1 rounded-full bg-brand-gold/25">
              <div className="h-1 w-2/3 rounded-full bg-brand-sweet" />
            </div>
          </div>
        ))}
      </section>

      <CandidateDuplicateScanCard />

      <JobDuplicateScanCard />

      <section className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div className="border-b border-brand-lea/10 px-4 py-3 dark:border-white/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">Review queue</p>
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Open review items</h2>
        </div>
        <div className="p-4">
          {data.items.length > 0 ? (
            <DuplicateReviewQueue items={data.items} />
          ) : (
            <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-8 text-center dark:border-white/10 dark:bg-white/5">
              <div className="text-lg font-semibold text-brand-lea dark:text-slate-100">No open duplicate reviews</div>
              <p className="mt-2 text-sm text-brand-grey dark:text-slate-400">
                Run a scan above to check for candidate or job duplicates. Resolved and dismissed pairs stay cleared.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
