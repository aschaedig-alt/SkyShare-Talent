import Link from "next/link";
import type { ReportsData } from "@/lib/data/reports";

type ReportsWorkspaceProps = {
  data: ReportsData;
  logoDataUrl?: string | null;
};

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
}

function MetricList({ items }: { items: Array<{ label: string; value: number }> }) {
  if (items.length === 0) {
    return <p className="text-sm text-brand-grey">No data yet.</p>;
  }

  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.label} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-brand-lea">{item.label}</span>
            <span className="text-sm font-semibold text-brand-lea">{item.value}</span>
          </div>
          <div className="mt-2 h-1 rounded-full bg-brand-gold/20">
            <div className="h-1 rounded-full bg-brand-sweet" style={{ width: `${Math.max(10, (item.value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReportsWorkspace({ data, logoDataUrl }: ReportsWorkspaceProps) {
  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className="flex items-start justify-between gap-4 rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">
            Recruiting insights
          </p>
          <h1 className="text-2xl font-semibold text-brand-lea">Reports</h1>
          <p className="mt-1 max-w-3xl text-sm text-brand-grey">
            Early reporting foundation for pipeline, sources, job coverage, document gaps, and pilot readiness.
          </p>
        </div>
        {logoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoDataUrl} alt="Workspace logo" className="h-12 w-auto shrink-0 object-contain" />
        ) : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Pipeline</p>
          <h2 className="text-base font-semibold text-brand-lea">Candidates by stage</h2>
          <div className="mt-3">
            <MetricList items={data.pipeline} />
          </div>
        </section>

        <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Source quality</p>
          <h2 className="text-base font-semibold text-brand-lea">Candidates by source</h2>
          <div className="mt-3">
            <MetricList items={data.sourceQuality} />
          </div>
        </section>

        <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Role coverage</p>
          <h2 className="text-base font-semibold text-brand-lea">Candidates by job</h2>
          <div className="mt-3">
            <MetricList items={data.jobCoverage} />
          </div>
        </section>

        <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Readiness</p>
          <h2 className="text-base font-semibold text-brand-lea">Documents and requirements</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">With files</div>
              <div className="mt-1 text-xl font-semibold text-brand-lea">{data.documentGaps.candidatesWithFiles}</div>
            </div>
            <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">Missing files</div>
              <div className="mt-1 text-xl font-semibold text-brand-lea">{data.documentGaps.candidatesWithoutFiles}</div>
            </div>
            <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">Active requirements</div>
              <div className="mt-1 text-xl font-semibold text-brand-lea">{data.readiness.activeRequirements}</div>
            </div>
            <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">Draft requirements</div>
              <div className="mt-1 text-xl font-semibold text-brand-lea">{data.readiness.draftRequirements}</div>
            </div>
          </div>
        </section>
      </section>

      {/* Document currency roll-up across all candidates */}
      <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Document currency</p>
        <h2 className="text-base font-semibold text-brand-lea">Expiring &amp; expired documents</h2>

        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          {[
            { label: "Expired", value: data.documentCurrency.counts.expired, tone: "text-red-600" },
            { label: "Due ≤ 30 days", value: data.documentCurrency.counts.due30, tone: "text-amber-600" },
            { label: "Due ≤ 90 days", value: data.documentCurrency.counts.due90, tone: "text-brand-lea" },
            { label: "Tracked total", value: data.documentCurrency.counts.total, tone: "text-brand-grey" }
          ].map((c) => (
            <div key={c.label} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">{c.label}</div>
              <div className={`mt-1 text-xl font-semibold ${c.tone}`}>{c.value}</div>
            </div>
          ))}
        </div>

        <div className="mt-4">
          {data.documentCurrency.upcoming.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                <thead className="bg-brand-cloudDancer/60 text-[11px] uppercase tracking-[0.14em] text-brand-grey">
                  <tr>
                    <th className="px-3 py-2 font-bold">Candidate</th>
                    <th className="px-3 py-2 font-bold">Document</th>
                    <th className="px-3 py-2 font-bold">Expires</th>
                    <th className="px-3 py-2 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-lea/10">
                  {data.documentCurrency.upcoming.map((item, i) => {
                    const tone = item.status === "expired" ? "text-red-600" : item.status === "due30" ? "text-amber-600" : "text-brand-lea";
                    return (
                      <tr key={i} className="transition hover:bg-brand-sweet/10">
                        <td className="px-3 py-2">
                          <Link href={`/candidates/${item.candidateId}`} className="font-semibold text-brand-lea hover:text-brand-eden transition hover:shadow-glow">
                            {item.candidateName}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-brand-black/80">{item.documentType ?? item.displayFilename}</td>
                        <td className="px-3 py-2 text-brand-grey">{fmtDate(item.expiresAt)}</td>
                        <td className={`px-3 py-2 font-semibold ${tone}`}>
                          {item.days < 0 ? `expired ${Math.abs(item.days)}d ago` : `${item.days}d left`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-brand-grey">No documents are expired or expiring within 90 days. Set expiry dates on Medical, Passport, and license documents to track currency here.</p>
          )}
        </div>
      </section>
    </div>
  );
}
