import Link from "next/link";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getHistoricalReports, type CountRow } from "@/lib/archive/reporting";

export const dynamic = "force-dynamic";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-brand-lea/10 bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:border-white/10 dark:bg-[#10243a] dark:ring-white/10">
      <div className="text-2xl font-semibold text-brand-lea dark:text-slate-100">{value}</div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">{label}</div>
    </div>
  );
}

function BarList({ title, rows, accent = "#466481" }: { title: string; rows: CountRow[]; accent?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-brand-grey dark:text-slate-400">No data.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-3">
              <div className="w-40 shrink-0 truncate text-xs text-brand-lea dark:text-slate-200" title={r.label}>
                {r.label}
              </div>
              <div className="h-4 flex-1 rounded bg-brand-cloudDancer/60 dark:bg-white/5">
                <div className="h-4 rounded" style={{ width: `${Math.round((r.count / max) * 100)}%`, backgroundColor: accent }} />
              </div>
              <div className="w-10 shrink-0 text-right text-xs font-semibold text-brand-grey dark:text-slate-400">{r.count}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default async function ArchiveReportsPage() {
  await requireModulePageAccess("archive");
  const r = await getHistoricalReports();

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className="rounded bg-brand-lea p-6 text-white shadow-panel">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Historical Candidate Archive</p>
            <h1 className="mt-1 text-2xl font-semibold">Historical reporting</h1>
            <p className="mt-1 text-sm text-brand-sweet">Trends across the imported legacy recruiting history.</p>
          </div>
          <Link href="/archive" className="rounded border border-white/20 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10">
            ← Back to search
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Historical candidates" value={r.totalCandidates.toLocaleString()} />
        <StatCard label="Historical applications" value={r.totalApplications.toLocaleString()} />
        <StatCard label="Repeat applicants" value={r.repeatApplicants.toLocaleString()} />
        <StatCard
          label="Offer acceptance rate"
          value={r.acceptanceRate == null ? "—" : `${Math.round(r.acceptanceRate * 100)}%`}
        />
      </div>

      <BarList title="Applications by year" rows={r.applicationsByYear} accent="#466481" />
      <BarList title="Outcomes (disposition)" rows={r.byDisposition} accent="#0d2c43" />
      <BarList title="Top reasons for rejection" rows={r.topRejectionReasons} accent="#ba0c2f" />

      <div className="grid gap-4 lg:grid-cols-2">
        <BarList title="Recruiter activity (applications)" rows={r.recruiterActivity} accent="#466481" />
        <BarList title="Interviewer activity" rows={r.interviewerActivity} accent="#eaaa00" />
      </div>
    </div>
  );
}
