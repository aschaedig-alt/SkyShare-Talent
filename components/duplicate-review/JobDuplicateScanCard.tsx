import Link from "next/link";

export function JobDuplicateScanCard() {
  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">
            Job duplicate scan
          </p>
          <h2 className="text-base font-semibold text-brand-lea">Find and merge duplicate job records</h2>
          <p className="mt-1 max-w-3xl text-xs text-brand-grey">
            Groups all jobs into duplicate clusters by identical or similar titles (60%+ match). Pick the job to keep
            in each cluster and merge the rest — applications and interviews move automatically.
          </p>
        </div>
        <Link
          href="/jobs/duplicates"
          className="rounded bg-brand-gold px-4 py-2 text-center text-sm font-semibold text-brand-black shadow-sm transition hover:bg-brand-gold/90"
        >
          Open Job Scanner
        </Link>
      </div>
    </section>
  );
}
