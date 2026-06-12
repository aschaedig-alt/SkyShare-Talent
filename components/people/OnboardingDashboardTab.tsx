"use client";

import Link from "next/link";
import { clsx } from "clsx";
import type { ChartDatum, OnboardingDashboard } from "@/lib/data/onboarding";

const STATUS_COLOR: Record<string, string> = {
  "In process": "#b8860b",
  Ready: "#2e7d32",
  Urgent: "#e2904a",
  Blocked: "#a32d2d"
};

const ALERT_STYLE: Record<string, { row: string; tag: string; label: string }> = {
  blocked: { row: "bg-red-50", tag: "text-red-700", label: "Blocked" },
  urgent: { row: "bg-red-50", tag: "text-red-700", label: "Urgent" },
  missing: { row: "bg-brand-gold/10", tag: "text-brand-lea", label: "Missing" }
};

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(iso));
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-grey">{label}</div>
      <div className={clsx("mt-1 text-3xl font-semibold", tone)}>{value}</div>
    </div>
  );
}

function Donut({ data }: { data: ChartDatum[] }) {
  const total = data.reduce((a, d) => a + d.count, 0);
  const r = 46;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-5">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <g transform="rotate(-90 60 60)">
          {total === 0 ? (
            <circle cx="60" cy="60" r={r} fill="none" stroke="#eee" strokeWidth="20" />
          ) : (
            data.map((d) => {
              const len = (d.count / total) * c;
              const seg = (
                <circle
                  key={d.label}
                  cx="60"
                  cy="60"
                  r={r}
                  fill="none"
                  stroke={STATUS_COLOR[d.label] ?? "#999"}
                  strokeWidth="20"
                  strokeDasharray={`${len} ${c - len}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += len;
              return seg;
            })
          )}
        </g>
        <text x="60" y="58" textAnchor="middle" className="fill-brand-lea" fontSize="20" fontWeight="600">
          {total}
        </text>
        <text x="60" y="74" textAnchor="middle" className="fill-brand-grey" fontSize="10">
          active
        </text>
      </svg>
      <div className="space-y-1.5">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2 text-sm text-brand-grey">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: STATUS_COLOR[d.label] ?? "#999" }} />
            {d.label} · {d.count}
          </div>
        ))}
      </div>
    </div>
  );
}

function HBars({ data, color }: { data: ChartDatum[]; color: string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3 text-sm">
          <span className="w-28 shrink-0 truncate text-brand-grey">{d.label}</span>
          <span className="h-3.5 flex-1 overflow-hidden rounded bg-brand-cloudDancer">
            <span className="block h-full rounded" style={{ width: `${(d.count / max) * 100}%`, background: color }} />
          </span>
          <span className="w-6 text-right text-brand-grey">{d.count}</span>
        </div>
      ))}
    </div>
  );
}

function VBars({ data }: { data: ChartDatum[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex h-40 items-end justify-between gap-2">
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-xs text-brand-grey">{d.count}</span>
          <span
            className="w-full rounded-t bg-brand-gold"
            style={{ height: `${Math.max(4, (d.count / max) * 120)}px` }}
          />
          <span className="text-[10px] text-brand-grey">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function OnboardingDashboardTab({ dashboard }: { dashboard: OnboardingDashboard }) {
  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Starting in 7 days" value={String(dashboard.startingSoon)} tone="text-sky-700" />
        <MetricCard label="Hires with missing items" value={String(dashboard.missingItems)} tone="text-brand-gold" />
        <MetricCard label="Urgent / blocked" value={String(dashboard.urgent)} tone="text-red-700" />
        <MetricCard label="Avg. completion" value={`${dashboard.avgCompletion}%`} tone="text-brand-lea" />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
          <h2 className="mb-3 text-base font-semibold text-brand-lea">By status</h2>
          <Donut data={dashboard.byStatus} />
        </div>
        <div className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
          <h2 className="mb-3 text-base font-semibold text-brand-lea">By department</h2>
          <HBars data={dashboard.byDepartment} color="#1d6fb8" />
        </div>
        <div className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
          <h2 className="mb-3 text-base font-semibold text-brand-lea">Starts by week</h2>
          <VBars data={dashboard.startsByWeek} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
          <h2 className="mb-3 text-base font-semibold text-brand-lea">Where active hires are in the process</h2>
          <HBars data={dashboard.funnel} color="#2e7d32" />
        </div>
        <div className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
          <h2 className="text-base font-semibold text-brand-lea">Needs attention</h2>
          <div className="mt-3 divide-y divide-brand-lea/5 overflow-hidden rounded border border-brand-lea/10">
            {dashboard.alerts.length === 0 ? (
              <p className="px-3 py-4 text-sm text-brand-grey">Nothing flagged — every active hire is on track.</p>
            ) : (
              dashboard.alerts.map((a, i) => {
                const s = ALERT_STYLE[a.level];
                return (
                  <Link
                    key={`${a.id}-${i}`}
                    href={`/people/${a.id}`}
                    className={clsx("flex items-center justify-between gap-3 px-3 py-2.5 text-sm transition hover:opacity-90", s.row)}
                  >
                    <span className="text-brand-black">
                      <span className="font-semibold">{a.name}</span> — {a.text}
                    </span>
                    <span className={clsx("shrink-0 text-xs font-bold uppercase tracking-wide", s.tag)}>{s.label}</span>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </section>

      <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
        <h2 className="text-base font-semibold text-brand-lea">Upcoming start dates</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {dashboard.upcomingStarts.length === 0 ? (
            <p className="text-sm text-brand-grey">No upcoming starts.</p>
          ) : (
            dashboard.upcomingStarts.map((u) => (
              <Link key={u.id} href={`/people/${u.id}`} className="flex items-center gap-3 text-sm hover:underline">
                <span className="w-14 shrink-0 font-semibold text-sky-700">{fmtDate(u.startDate)}</span>
                <span className="truncate text-brand-black">
                  {u.name}
                  {u.position ? <span className="text-brand-grey"> · {u.position}</span> : null}
                </span>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
