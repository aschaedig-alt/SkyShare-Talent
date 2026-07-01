import { JobDuplicateClusters } from "@/components/jobs/JobDuplicateClusters";
import { JobMergedHistory } from "@/components/jobs/JobMergedHistory";

export function JobDuplicateScanCard() {
  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="mb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">Job duplicate scan</p>
        <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Find and merge duplicate job records</h2>
        <p className="mt-1 max-w-3xl text-xs text-brand-grey dark:text-slate-400">
          Groups jobs into clusters by identical or similar titles (60%+ match). For each cluster, pick the job to keep,
          check the ones that are truly the same role, expand any job to inspect its details, then merge — applications
          and interviews move automatically.
        </p>
      </div>

      <JobDuplicateClusters />

      <JobMergedHistory />
    </section>
  );
}
