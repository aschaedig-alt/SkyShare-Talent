import Link from "next/link";
import { clsx } from "clsx";
import { getAnalyticsData, type AnalyticsRange } from "@/lib/data/compliments";
import { getComplimentsSettings, getComplimentsRole } from "@/lib/compliments/settings";
import { Card } from "@/components/compliments/Card";
import { MetricCard } from "@/components/compliments/MetricCard";
import { Avatar } from "@/components/compliments/Avatar";
import { valueColorClasses } from "@/lib/compliments/value-colors";
import { pointsToDollars } from "@/lib/compliments/constants";

export const dynamic = "force-dynamic";

const RANGES: { key: AnalyticsRange; label: string }[] = [
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
  { key: "365", label: "This year" }
];

// Insights are for managers/operators, not read-only viewers.
const VIEWER_ROLE = "VIEWER";

function rangeFromParam(value: string | undefined): AnalyticsRange {
  return value === "90" || value === "365" ? value : "30";
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const role = await getComplimentsRole();

  if (role === VIEWER_ROLE) {
    return (
      <Card padding="lg">
        <div className="py-10 text-center">
          <p className="text-sm font-medium text-brand-lea dark:text-slate-100">Insights are available to managers</p>
          <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
            Ask an admin for recruiter or manager access to see recognition analytics.
          </p>
        </div>
      </Card>
    );
  }

  const sp = await searchParams;
  const range = rangeFromParam(sp.range);
  const [data, settings] = await Promise.all([getAnalyticsData(range), getComplimentsSettings()]);

  const maxValueCount = Math.max(1, ...data.byValue.map((v) => v.count));
  const maxDeptCount = Math.max(1, ...data.byDepartment.map((d) => d.count));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-brand-lea dark:text-slate-100">Team insights</h2>
          <p className="text-sm text-brand-grey dark:text-slate-400">Recognition and engagement across new hires.</p>
        </div>
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={r.key === "30" ? "/compliments/analytics" : `/compliments/analytics?range=${r.key}`}
              className={clsx(
                "rounded-element border-[0.5px] px-3 py-1.5 text-xs font-medium transition hover:shadow-glow",
                range === r.key
                  ? "border-brand-lea bg-brand-lea text-white"
                  : "border-brand-lea/20 text-brand-grey hover:text-brand-lea dark:border-white/10 dark:text-slate-400 dark:text-slate-100"
              )}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total recognitions" value={data.totalRecognitions} trend={data.recognitionsTrend} />
        <MetricCard label="Participation" value={`${data.participationPct}%`} sublabel="gave recognition" />
        <MetricCard label="Avg per person" value={data.avgPerPerson} sublabel="recognitions" />
        <MetricCard
          label="Points distributed"
          value={data.pointsDistributed.toLocaleString()}
          sublabel={`${pointsToDollars(data.pointsDistributed, settings.pointsPerDollar)} value`}
          trend={data.pointsTrend}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card padding="lg">
          <h3 className="mb-5 text-base font-medium text-brand-lea dark:text-slate-100">Recognitions by value</h3>
          {data.byValue.every((v) => v.count === 0) ? (
            <p className="text-sm text-brand-grey dark:text-slate-400">No recognition in this range yet.</p>
          ) : (
            <div className="space-y-4">
              {data.byValue.map((v) => (
                <div key={v.name}>
                  <div className="mb-1.5 flex justify-between text-[13px]">
                    <span className="font-medium text-brand-lea dark:text-slate-100">{v.name}</span>
                    <span className="text-brand-grey dark:text-slate-400">
                      {v.count} ({v.pct}%)
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-brand-cloudDancer dark:bg-white/5">
                    <div
                      className={clsx("h-full rounded-full", valueColorClasses(v.colorKey).barFill)}
                      style={{ width: `${Math.round((v.count / maxValueCount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card padding="lg">
          <h3 className="mb-4 text-base font-medium text-brand-lea dark:text-slate-100">Top recipients</h3>
          {data.topRecipients.length === 0 ? (
            <p className="text-sm text-brand-grey dark:text-slate-400">No recognition in this range yet.</p>
          ) : (
            <ul>
              {data.topRecipients.map((r) => (
                <li
                  key={r.name}
                  className="flex items-center justify-between border-b border-brand-lea/10 py-2.5 last:border-0 dark:border-white/10"
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar name={r.name} initials={r.initials} size="sm" />
                    <div>
                      <p className="text-[13px] font-medium text-brand-lea dark:text-slate-100">{r.name}</p>
                      <p className="text-xs text-brand-grey dark:text-slate-400">{r.department ?? "Unassigned"}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-brand-lea dark:text-slate-100">{r.count}</p>
                    <p className="text-xs text-brand-grey dark:text-slate-400">recognitions</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card padding="lg">
        <h3 className="mb-1 text-base font-medium text-brand-lea dark:text-slate-100">Recognition equity across departments</h3>
        <p className="mb-5 text-xs text-brand-grey dark:text-slate-400">
          Surfaces under-recognized teams so recognition stays fair across the company.
        </p>
        {data.byDepartment.length === 0 ? (
          <p className="text-sm text-brand-grey dark:text-slate-400">No department data in this range yet.</p>
        ) : (
          <div className="space-y-3">
            {data.byDepartment.map((d) => (
              <div key={d.department} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-[13px] font-medium text-brand-lea dark:text-slate-100">{d.department}</span>
                <span className="w-12 shrink-0 text-right text-[13px] text-brand-lea dark:text-slate-100">{d.count}</span>
                <span className="w-12 shrink-0 text-right text-[13px] text-brand-grey dark:text-slate-400">{d.pct}%</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand-cloudDancer dark:bg-white/5">
                  <div
                    className="h-full rounded-full bg-brand-eden"
                    style={{ width: `${Math.round((d.count / maxDeptCount) * 100)}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-xs text-brand-grey dark:text-slate-400">{d.people} ppl</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
