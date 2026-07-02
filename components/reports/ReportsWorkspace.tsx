import Link from "next/link";
import type { ReportsData } from "@/lib/data/reports";
import { formatUsd, travelPurposeLabel } from "@/lib/travel/constants";

type ReportsWorkspaceProps = {
  data: ReportsData;
  logoDataUrl?: string | null;
};

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
}

// Human span for an average day count (upgrade timing).
function fmtSpan(days: number | null): string {
  if (days === null) return "—";
  if (days < 60) return `${days} days`;
  const months = days / 30.44;
  if (months < 18) return `${months.toFixed(months < 3 ? 1 : 0)} mo`;
  return `${(days / 365).toFixed(1)} yr`;
}

function MetricList({ items }: { items: Array<{ label: string; value: number }> }) {
  if (items.length === 0) {
    return <p className="text-sm text-brand-grey dark:text-slate-400">No data yet.</p>;
  }

  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={`${item.label}-${i}`} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-brand-lea dark:text-slate-100">{item.label}</span>
            <span className="text-sm font-semibold text-brand-lea dark:text-slate-100">{item.value}</span>
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
      <section className="flex items-start justify-between gap-4 rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">
            Recruiting insights
          </p>
          <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Reports</h1>
          <p className="mt-1 max-w-3xl text-sm text-brand-grey dark:text-slate-400">
            Early reporting foundation for pipeline, sources, job coverage, document gaps, and pilot readiness.
          </p>
        </div>
        {logoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoDataUrl} alt="Workspace logo" className="h-12 w-auto shrink-0 object-contain" />
        ) : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Pipeline</p>
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Candidates by stage</h2>
          <div className="mt-3">
            <MetricList items={data.pipeline} />
          </div>
        </section>

        <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Source quality</p>
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Candidates by source</h2>
          <div className="mt-3">
            <MetricList items={data.sourceQuality} />
          </div>
        </section>

        <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Role coverage</p>
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Candidates by job</h2>
          <div className="mt-3">
            <MetricList items={data.jobCoverage} />
          </div>
        </section>

        <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Readiness</p>
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Documents and requirements</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">With files</div>
              <div className="mt-1 text-xl font-semibold text-brand-lea dark:text-slate-100">{data.documentGaps.candidatesWithFiles}</div>
            </div>
            <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">Missing files</div>
              <div className="mt-1 text-xl font-semibold text-brand-lea dark:text-slate-100">{data.documentGaps.candidatesWithoutFiles}</div>
            </div>
            <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">Active requirements</div>
              <div className="mt-1 text-xl font-semibold text-brand-lea dark:text-slate-100">{data.readiness.activeRequirements}</div>
            </div>
            <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">Draft requirements</div>
              <div className="mt-1 text-xl font-semibold text-brand-lea dark:text-slate-100">{data.readiness.draftRequirements}</div>
            </div>
          </div>
        </section>
      </section>

      {/* Document currency roll-up across all candidates */}
      <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Document currency</p>
        <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Expiring &amp; expired documents</h2>

        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          {[
            { label: "Expired", value: data.documentCurrency.counts.expired, tone: "text-red-600" },
            { label: "Due ≤ 30 days", value: data.documentCurrency.counts.due30, tone: "text-amber-600" },
            { label: "Due ≤ 90 days", value: data.documentCurrency.counts.due90, tone: "text-brand-lea dark:text-slate-100" },
            { label: "Tracked total", value: data.documentCurrency.counts.total, tone: "text-brand-grey dark:text-slate-400" }
          ].map((c) => (
            <div key={c.label} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">{c.label}</div>
              <div className={`mt-1 text-xl font-semibold ${c.tone}`}>{c.value}</div>
            </div>
          ))}
        </div>

        <div className="mt-4">
          {data.documentCurrency.upcoming.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                <thead className="bg-brand-cloudDancer/60 text-[11px] uppercase tracking-[0.14em] text-brand-grey dark:bg-white/5 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-bold">Candidate</th>
                    <th className="px-3 py-2 font-bold">Document</th>
                    <th className="px-3 py-2 font-bold">Expires</th>
                    <th className="px-3 py-2 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-lea/10 dark:divide-white/10">
                  {data.documentCurrency.upcoming.map((item, i) => {
                    const tone = item.status === "expired" ? "text-red-600" : item.status === "due30" ? "text-amber-600" : "text-brand-lea dark:text-slate-100";
                    return (
                      <tr key={i} className="transition hover:bg-brand-sweet/10">
                        <td className="px-3 py-2">
                          <Link href={`/candidates/${item.candidateId}`} className="font-semibold text-brand-lea hover:text-brand-eden transition hover:shadow-glow dark:text-slate-100">
                            {item.candidateName}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-brand-black/80 dark:text-slate-300">{item.documentType ?? item.displayFilename}</td>
                        <td className="px-3 py-2 text-brand-grey dark:text-slate-400">{fmtDate(item.expiresAt)}</td>
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
            <p className="text-sm text-brand-grey dark:text-slate-400">No documents are expired or expiring within 90 days. Set expiry dates on Medical, Passport, and license documents to track currency here.</p>
          )}
        </div>
      </section>

      {/* Travel spend — onboarding + candidate fly-out budget roll-up */}
      <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Travel spend</p>
        <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Recruiting &amp; onboarding travel</h2>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
          Booked travel across {data.travelSpend.tripCount} {data.travelSpend.tripCount === 1 ? "trip" : "trips"} (excludes canceled).
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Total spend", value: formatUsd(data.travelSpend.totalSpend), tone: "text-brand-lea dark:text-slate-100" },
            { label: "Hired travelers", value: formatUsd(data.travelSpend.hiredSpend), tone: "text-emerald-600" },
            { label: "Not hired", value: formatUsd(data.travelSpend.notHiredSpend), tone: "text-amber-600" },
            {
              label: "Cost per hire",
              value: data.travelSpend.costPerHire === null ? "—" : formatUsd(data.travelSpend.costPerHire),
              tone: "text-brand-lea dark:text-slate-100"
            }
          ].map((c) => (
            <div key={c.label} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">{c.label}</div>
              <div className={`mt-1 text-xl font-semibold ${c.tone}`}>{c.value}</div>
            </div>
          ))}
        </div>

        {data.travelSpend.byPurpose.length > 0 && (
          <div className="mt-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">By purpose</div>
            <div className="mt-2 space-y-2">
              {data.travelSpend.byPurpose.map((p) => {
                const max = Math.max(...data.travelSpend.byPurpose.map((x) => x.spend), 1);
                return (
                  <div key={p.purpose} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-brand-lea dark:text-slate-100">
                        {travelPurposeLabel(p.purpose)} <span className="text-brand-grey dark:text-slate-400">· {p.trips} {p.trips === 1 ? "trip" : "trips"}</span>
                      </span>
                      <span className="text-sm font-semibold text-brand-lea dark:text-slate-100">{formatUsd(p.spend)}</span>
                    </div>
                    <div className="mt-2 h-1 rounded-full bg-brand-gold/20">
                      <div className="h-1 rounded-full bg-brand-sweet" style={{ width: `${Math.max(8, (p.spend / max) * 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Pilot upgrades — First Officer → Captain timing across the fleet */}
      <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Pilot upgrades</p>
        <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Role &amp; aircraft progressions</h2>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
          {data.pilotUpgrades.upgraded} of {data.pilotUpgrades.pilotsTracked} pilots have moved to a new role or aircraft
          {data.pilotUpgrades.captainUpgrades > 0 ? ` · ${data.pilotUpgrades.captainUpgrades} made Captain (First Officer → Captain)` : ""}. Built from each employee&apos;s role journey.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Avg time to first move", value: fmtSpan(data.pilotUpgrades.avgDaysToUpgrade), tone: "text-brand-lea dark:text-slate-100" },
            { label: "Median time", value: fmtSpan(data.pilotUpgrades.medianDaysToUpgrade), tone: "text-brand-lea dark:text-slate-100" },
            { label: "Progressed within 1 yr", value: `${data.pilotUpgrades.pctWithin1yr}%`, tone: "text-emerald-600 dark:text-emerald-300" },
            { label: "Progressed within 2 yr", value: `${data.pilotUpgrades.pctWithin2yr}%`, tone: "text-emerald-600 dark:text-emerald-300" }
          ].map((c) => (
            <div key={c.label} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">{c.label}</div>
              <div className={`mt-1 text-xl font-semibold ${c.tone}`}>{c.value}</div>
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Progressed once", value: data.pilotUpgrades.upgradedOnce },
            { label: "Progressed 2×+", value: data.pilotUpgrades.upgradedTwicePlus },
            { label: "Progressed 3×+", value: data.pilotUpgrades.upgradedThricePlus }
          ].map((c) => (
            <div key={c.label} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">{c.label}</div>
              <div className="mt-1 text-xl font-semibold text-brand-lea dark:text-slate-100">{c.value}</div>
            </div>
          ))}
        </div>

        {!data.pilotUpgrades.hasData && (
          <p className="mt-3 rounded border border-brand-lea/10 bg-brand-cloudDancer/45 px-3 py-2 text-xs text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
            No progressions recorded yet. Record role changes on employee profiles (or import promotion history) and these numbers populate automatically.
          </p>
        )}
      </section>
    </div>
  );
}
