import { completedBuildItems, upcomingBuildItems } from "@/lib/build-checklist";

export function BuildChecklistPanel() {
  return (
    <aside className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">
            Build checklist
          </p>
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">What is next</h2>
        </div>
        <span className="rounded bg-brand-sweet/25 px-2 py-1 text-[11px] font-semibold text-brand-lea dark:text-slate-100">
          Live tracker
        </span>
      </div>

      <div className="mt-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">
          Completed foundation
        </div>
        <div className="mt-2 space-y-2">
          {completedBuildItems.map((item) => (
            <div key={item} className="flex gap-2 rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-2 dark:border-white/10 dark:bg-white/5">
              <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full bg-emerald-500" />
              <span className="text-xs font-semibold leading-5 text-brand-lea dark:text-slate-100">{item}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">
          Upcoming
        </div>
        <div className="mt-2 space-y-2">
          {upcomingBuildItems.map((item, index) => (
            <div key={item} className="flex gap-2 rounded border border-brand-lea/10 bg-white p-2 dark:border-white/10 dark:bg-brand-panel">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-gold/20 text-[11px] font-bold text-brand-lea dark:text-slate-100">
                {index + 1}
              </span>
              <span className="text-xs font-semibold leading-5 text-brand-black/76 dark:text-slate-300">{item}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
