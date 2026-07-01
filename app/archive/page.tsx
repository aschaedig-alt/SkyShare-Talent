import Link from "next/link";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { searchHistorical, DISPOSITIONS, type HistoricalSearchFilters } from "@/lib/archive/search";

type ArchivePageProps = {
  searchParams?: Promise<Record<string, string | undefined>>;
};

const inputClass =
  "w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-lea outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 dark:border-white/10 dark:bg-brand-panel dark:text-slate-100";
const labelClass = "block text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400";

function Field({ label, name, value, type = "text", placeholder }: { label: string; name: string; value?: string; type?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input className={`mt-1 ${inputClass}`} name={name} defaultValue={value ?? ""} type={type} placeholder={placeholder} />
    </label>
  );
}

function dispositionBadge(disposition: string | null) {
  const map: Record<string, string> = {
    HIRED: "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
    OFFER: "bg-brand-gold/20 text-brand-eden",
    INTERVIEWED: "bg-brand-sweet/30 text-brand-lea",
    REJECTED: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300",
    APPLIED: "bg-brand-cloudDancer text-brand-grey"
  };
  const cls = (disposition && map[disposition]) || "bg-brand-cloudDancer text-brand-grey";
  return <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{disposition ?? "—"}</span>;
}

export default async function ArchivePage({ searchParams }: ArchivePageProps) {
  await requireModulePageAccess("archive");
  const params = (await searchParams) ?? {};
  const filters: HistoricalSearchFilters = {
    q: params.q,
    recruiter: params.recruiter,
    interviewer: params.interviewer,
    disposition: params.disposition,
    jobTitle: params.jobTitle,
    candidateNumber: params.candidateNumber,
    applicationNumber: params.applicationNumber,
    from: params.from,
    to: params.to
  };
  const hasFilters = Object.values(filters).some((v) => v && v.trim().length > 0);
  const result = hasFilters ? await searchHistorical(filters) : null;

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className="rounded bg-brand-lea p-6 text-white shadow-panel">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Historical Candidate Archive</p>
            <h1 className="mt-1 text-2xl font-semibold">Historical search</h1>
            <p className="mt-1 text-sm text-brand-sweet">
              Search years of legacy recruiting history — by name, recruiter, interviewer, job, status, dates, or candidate / application number.
            </p>
          </div>
          <Link href="/archive/reports" className="shrink-0 rounded border border-white/20 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10">
            Reporting →
          </Link>
        </div>
      </section>

      {/* Filters — native GET form: submitting puts the filters in the URL */}
      <form action="/archive" method="get" className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-3">
            <Field label="Keyword" name="q" value={filters.q} placeholder="Name, email, phone, job, recruiter, note text…" />
          </div>
          <Field label="Recruiter" name="recruiter" value={filters.recruiter} />
          <Field label="Interviewer" name="interviewer" value={filters.interviewer} />
          <label className="block">
            <span className={labelClass}>Disposition</span>
            <select className={`mt-1 ${inputClass}`} name="disposition" defaultValue={filters.disposition ?? ""}>
              <option value="">Any</option>
              {DISPOSITIONS.map((d) => (
                <option key={d} value={d}>
                  {d.charAt(0) + d.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <Field label="Job title" name="jobTitle" value={filters.jobTitle} />
          <Field label="Candidate number" name="candidateNumber" value={filters.candidateNumber} />
          <Field label="Application number" name="applicationNumber" value={filters.applicationNumber} />
          <Field label="Applied from" name="from" value={filters.from} type="date" />
          <Field label="Applied to" name="to" value={filters.to} type="date" />
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button type="submit" className="rounded bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-black transition hover:bg-brand-gold/90">
            Search archive
          </button>
          <Link href="/archive" className="rounded border border-brand-lea/20 px-4 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/30 dark:border-white/10 dark:text-slate-100">
            Clear
          </Link>
        </div>
      </form>

      {result && (
        <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <div className="flex items-baseline justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Results</p>
            <span className="text-xs text-brand-grey dark:text-slate-400">
              {result.total} found{result.truncated ? ` · showing first ${result.rows.length}` : ""}
            </span>
          </div>
          {result.rows.length === 0 ? (
            <div className="mt-3 rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-4 text-sm dark:border-white/10 dark:bg-white/5">
              <div className="font-semibold text-brand-lea dark:text-slate-100">No historical records match</div>
              <p className="mt-1 text-brand-grey dark:text-slate-400">Try fewer or broader filters.</p>
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-lea/15 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:border-white/10 dark:text-slate-400">
                    <th className="py-2 pr-3">Candidate</th>
                    <th className="px-3">Top role</th>
                    <th className="px-3">Latest status</th>
                    <th className="px-3 text-center">Apps</th>
                    <th className="px-3 text-center">Interviews</th>
                    <th className="px-3">Recruiter</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr key={row.id} className="border-b border-brand-lea/8 last:border-0 dark:border-white/5">
                      <td className="py-2.5 pr-3">
                        <Link href={`/candidates/${row.id}`} className="font-semibold text-brand-lea hover:text-brand-eden dark:text-slate-100">
                          {row.displayName}
                        </Link>
                        <div className="text-xs text-brand-grey dark:text-slate-400">{row.primaryEmail ?? "No email"}</div>
                      </td>
                      <td className="px-3 text-brand-lea dark:text-slate-200">{row.topJobTitle ?? "—"}</td>
                      <td className="px-3">{dispositionBadge(row.latestDisposition)}</td>
                      <td className="px-3 text-center text-brand-grey dark:text-slate-400">{row.applicationCount}</td>
                      <td className="px-3 text-center text-brand-grey dark:text-slate-400">{row.interviewCount}</td>
                      <td className="px-3 text-brand-grey dark:text-slate-400">{row.recruiters[0] ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
