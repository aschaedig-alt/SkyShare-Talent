"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Check, RotateCcw } from "lucide-react";
import type { ChartDatum, DrillPerson, OnboardingDashboard, WorklistPerson } from "@/lib/data/onboarding";
import { formatCalendarDayShort, formatMomentDateShort } from "@/lib/dates/display";

const STATUS_COLOR: Record<string, string> = {
  "In progress": "#b8860b",
  Ready: "#2e7d32",
  "Due soon": "#e2904a",
  Overdue: "#a32d2d"
};

const ALERT_STYLE: Record<string, { row: string; tag: string; label: string }> = {
  blocked: { row: "bg-red-50 dark:bg-red-500/15", tag: "text-red-700 dark:text-red-300", label: "Overdue" },
  urgent: { row: "bg-red-50 dark:bg-red-500/15", tag: "text-red-700 dark:text-red-300", label: "Urgent" },
  missing: { row: "bg-brand-gold/10", tag: "text-brand-lea dark:text-slate-100", label: "To do" },
  // The only positive level: nothing is wrong, someone is waiting on us to act.
  ready: { row: "bg-emerald-50 dark:bg-emerald-500/15", tag: "text-emerald-700 dark:text-emerald-300", label: "Ready" }
};

// startDate is a chosen calendar day (UTC); onboardedAt is the moment someone was
// marked onboarded, so it reads in Mountain — otherwise anyone onboarded in the
// evening shows tomorrow's date. See lib/dates/display.ts.
function fmtDate(iso: string) {
  return formatCalendarDayShort(iso);
}
function fmtMoment(iso: string) {
  return formatMomentDateShort(iso);
}

function MetricCard({
  label,
  value,
  tone,
  onClick,
  active,
  count
}: {
  label: string;
  value: string;
  tone: string;
  onClick?: () => void;
  active?: boolean;
  count?: number;
}) {
  const clickable = Boolean(onClick) && (count ?? 1) > 0;
  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      aria-expanded={clickable ? active : undefined}
      className={clsx(
        "rounded bg-white p-4 text-left shadow-panel ring-1 ring-brand-lea/10 transition dark:bg-brand-panel dark:ring-white/10",
        clickable ? "cursor-pointer hover:shadow-glow hover:ring-brand-gold/40" : "cursor-default",
        active && "ring-2 ring-brand-gold/60"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">{label}</div>
        {clickable && <span className="text-[10px] font-semibold text-brand-gold">{active ? "hide" : "view"}</span>}
      </div>
      <div className={clsx("mt-1 text-3xl font-semibold", tone)}>{value}</div>
    </button>
  );
}

const DRILL_STATUS_STYLE: Record<string, string> = {
  Overdue: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  "Due soon": "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  "In progress": "bg-brand-gold/15 text-brand-lea dark:text-slate-100",
  Ready: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
};

function DrillPanel({ title, people, onClose }: { title: string; people: DrillPerson[]; onClose: () => void }) {
  return (
    <div className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-gold/30 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-brand-lea dark:text-slate-100">{title} · {people.length}</h3>
        <button onClick={onClose} className="text-xs font-semibold text-brand-grey hover:text-brand-lea dark:text-slate-400">Close</button>
      </div>
      {people.length === 0 ? (
        <p className="mt-2 text-sm text-brand-grey dark:text-slate-400">No one right now.</p>
      ) : (
        <div className="mt-2 divide-y divide-brand-lea/5 dark:divide-white/10">
          {people.map((p) => (
            <Link key={p.id} href={`/people/${p.id}`} className="flex items-center justify-between gap-3 rounded px-4 py-2.5 text-sm transition-shadow hover:shadow-glow">
              <span className="min-w-0 truncate">
                <span className="font-semibold text-brand-lea dark:text-slate-100">{p.name}</span>
                {p.position ? <span className="text-brand-grey dark:text-slate-400"> · {p.position}</span> : null}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {p.startDate ? <span className="text-xs text-brand-grey dark:text-slate-400">starts {fmtDate(p.startDate)}</span> : null}
                <span className="text-xs text-brand-grey dark:text-slate-400">{p.doneCount}/{p.applicableCount}</span>
                <span className={clsx("rounded px-2 py-0.5 text-[10px] font-semibold", DRILL_STATUS_STYLE[p.status] ?? "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400")}>{p.status}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
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
        <text x="60" y="58" textAnchor="middle" className="fill-brand-lea dark:fill-slate-100" fontSize="20" fontWeight="600">
          {total}
        </text>
        <text x="60" y="74" textAnchor="middle" className="fill-brand-grey dark:fill-slate-400" fontSize="10">
          active
        </text>
      </svg>
      <div className="space-y-1.5">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2 text-sm text-brand-grey dark:text-slate-400">
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
          <span className="w-28 shrink-0 truncate text-brand-grey dark:text-slate-400">{d.label}</span>
          <span className="h-3.5 flex-1 overflow-hidden rounded bg-brand-cloudDancer dark:bg-white/5">
            <span className="block h-full rounded" style={{ width: `${(d.count / max) * 100}%`, background: color }} />
          </span>
          <span className="w-6 text-right text-brand-grey dark:text-slate-400">{d.count}</span>
        </div>
      ))}
    </div>
  );
}

function SegBar({ segments }: { segments: { value: number; color: string }[] }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  return (
    <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-brand-cloudDancer dark:bg-white/10">
      {total === 0
        ? null
        : segments.map((s, i) => (s.value > 0 ? <span key={i} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} /> : null))}
    </div>
  );
}

function VBars({ data }: { data: ChartDatum[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex h-40 items-end justify-between gap-2">
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-xs text-brand-grey dark:text-slate-400">{d.count}</span>
          <span
            className="w-full rounded-t bg-brand-gold"
            style={{ height: `${Math.max(4, (d.count / max) * 120)}px` }}
          />
          <span className="text-[10px] text-brand-grey dark:text-slate-400">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function WorklistRow({ p, onHide, onRestore }: { p: WorklistPerson; onHide?: () => void; onRestore?: () => void }) {
  const pct = p.applicableCount > 0 ? Math.round((p.doneCount / p.applicableCount) * 100) : 0;
  return (
    <div className="group flex items-center gap-3 rounded px-4 py-2.5 text-sm transition-shadow hover:shadow-glow">
      {onHide && (
        <button
          onClick={onHide}
          title="Check off — hide from this list"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-brand-grey/40 text-transparent transition hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-500/15"
        >
          <Check className="h-3 w-3" />
        </button>
      )}
      <Link href={`/people/${p.id}`} className="min-w-0 flex-1 truncate group-hover:underline">
        <span className="font-semibold text-brand-lea dark:text-slate-100">{p.name}</span>
        {p.position ? <span className="text-brand-grey dark:text-slate-400"> · {p.position}</span> : null}
      </Link>
      <span className="hidden h-2 w-24 shrink-0 overflow-hidden rounded-full bg-brand-cloudDancer sm:block dark:bg-white/10">
        <span className={clsx("block h-full rounded-full", pct === 100 ? "bg-emerald-500" : "bg-brand-gold")} style={{ width: `${Math.max(4, pct)}%` }} />
      </span>
      <span className="w-16 shrink-0 text-right text-xs text-brand-grey dark:text-slate-400">
        {p.onboardedAt ? `onb ${fmtMoment(p.onboardedAt)}` : p.startDate ? fmtDate(p.startDate) : "no date"}
      </span>
      <span className={clsx("w-20 shrink-0 rounded px-2 py-0.5 text-center text-[10px] font-semibold", DRILL_STATUS_STYLE[p.status] ?? "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400")}>{p.status}</span>
      {onRestore && (
        <button onClick={onRestore} title="Show again" className="shrink-0 rounded border border-brand-lea/20 px-2 py-0.5 text-[11px] font-semibold text-brand-eden transition hover:bg-brand-cloudDancer/40 dark:border-white/10 dark:text-slate-200">
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export function OnboardingDashboardTab({ dashboard }: { dashboard: OnboardingDashboard }) {
  const [drill, setDrill] = useState<null | "starting" | "missing" | "attention">(null);
  const toggle = (key: "starting" | "missing" | "attention") => setDrill((cur) => (cur === key ? null : key));

  // Worklist state — checking someone off hides them for everyone (shared, reversible).
  const [worklist, setWorklist] = useState<WorklistPerson[]>(dashboard.worklist);
  const [hidden, setHidden] = useState<WorklistPerson[]>(dashboard.worklistHidden);
  const [showHidden, setShowHidden] = useState(false);
  useEffect(() => {
    setWorklist(dashboard.worklist);
    setHidden(dashboard.worklistHidden);
  }, [dashboard.worklist, dashboard.worklistHidden]);

  async function setHiddenState(p: WorklistPerson, hide: boolean) {
    if (hide) {
      setWorklist((w) => w.filter((x) => x.id !== p.id));
      setHidden((h) => [p, ...h]);
    } else {
      setHidden((h) => h.filter((x) => x.id !== p.id));
      setWorklist((w) => [...w, p]);
    }
    try {
      await fetch("/api/onboarding/dashboard-hidden", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, hidden: hide })
      });
    } catch {
      /* best-effort; a reload reconciles from the server */
    }
  }

  const drillView =
    drill === "starting"
      ? { title: "Starting in 7 days", people: dashboard.startingSoonList }
      : drill === "missing"
        ? { title: "Hires with missing items", people: dashboard.missingItemsList }
        : drill === "attention"
          ? { title: "Needs attention", people: dashboard.needsAttentionList }
          : null;

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Starting in 7 days" value={String(dashboard.startingSoon)} tone="text-sky-700 dark:text-sky-300" count={dashboard.startingSoon} active={drill === "starting"} onClick={() => toggle("starting")} />
        <MetricCard label="Hires with missing items" value={String(dashboard.missingItems)} tone="text-brand-gold" count={dashboard.missingItems} active={drill === "missing"} onClick={() => toggle("missing")} />
        <MetricCard label="Needs attention" value={String(dashboard.urgent)} tone="text-red-700 dark:text-red-300" count={dashboard.urgent} active={drill === "attention"} onClick={() => toggle("attention")} />
        <MetricCard label="Avg. completion" value={`${dashboard.avgCompletion}%`} tone="text-brand-lea dark:text-slate-100" />
      </section>

      {drillView ? <DrillPanel title={drillView.title} people={drillView.people} onClose={() => setDrill(null)} /> : null}

      {/* No start date — these hires are filtered out of every date-based panel
          below, so surface them here or they silently disappear from the board. */}
      {dashboard.noStartDateList.length > 0 && (
        <section className="rounded border border-amber-300/70 bg-amber-50 p-4 shadow-panel dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-amber-900 dark:text-amber-200">No start date yet · {dashboard.noStartDateList.length}</h2>
            <span className="text-[11px] text-amber-800 dark:text-amber-300">Hidden from “starting soon” until a date is set</span>
          </div>
          <div className="mt-2 divide-y divide-amber-200/60 dark:divide-amber-500/20">
            {dashboard.noStartDateList.map((p) => (
              <Link key={p.id} href={`/people/${p.id}`} className="flex items-center justify-between gap-3 rounded px-4 py-2.5 text-sm transition-shadow hover:shadow-glow">
                <span className="min-w-0 truncate">
                  <span className="font-semibold text-amber-900 dark:text-amber-100">{p.name}</span>
                  {p.position ? <span className="text-amber-800/80 dark:text-amber-300/80"> · {p.position}</span> : null}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-amber-800/80 dark:text-amber-300/80">{p.doneCount}/{p.applicableCount}</span>
                  <span className="rounded bg-amber-200/70 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">Set a start date</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Ready for their start — quick scan of who's starting soon and how ready */}
      <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Ready for their start?</h2>
        <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">Starting in the next 3 weeks · {dashboard.readyForStart.length}</p>
        {dashboard.readyForStart.length === 0 ? (
          <p className="mt-3 text-sm text-brand-grey dark:text-slate-400">No one starts in the next three weeks.</p>
        ) : (
          <div className="mt-3 divide-y divide-brand-lea/5 dark:divide-white/10">
            {dashboard.readyForStart.map((p) => {
              const pct = p.applicableCount > 0 ? Math.round((p.doneCount / p.applicableCount) * 100) : 0;
              return (
                <Link key={p.id} href={`/people/${p.id}`} className="flex items-center gap-3 rounded px-4 py-2.5 text-sm transition-shadow hover:shadow-glow">
                  <span className="w-12 shrink-0 font-semibold text-sky-700 dark:text-sky-300">{p.startDate ? fmtDate(p.startDate) : "—"}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-semibold text-brand-lea dark:text-slate-100">{p.name}</span>
                    {p.position ? <span className="text-brand-grey dark:text-slate-400"> · {p.position}</span> : null}
                  </span>
                  <span className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-brand-cloudDancer dark:bg-white/10">
                    <span className={clsx("block h-full rounded-full", pct === 100 ? "bg-emerald-500" : "bg-brand-gold")} style={{ width: `${Math.max(4, pct)}%` }} />
                  </span>
                  <span className="w-10 shrink-0 text-right text-xs text-brand-grey dark:text-slate-400">{pct}%</span>
                  <span className={clsx("w-20 shrink-0 rounded px-2 py-0.5 text-center text-[10px] font-semibold", DRILL_STATUS_STYLE[p.status] ?? "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400")}>{p.status}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* In onboarding — the running worklist: active + recently onboarded, check
          off to hide (shared across the team). */}
      <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">In onboarding</h2>
            <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">Everyone active, plus anyone onboarded in the last few weeks. Check a person off to hide them. · {worklist.length}</p>
          </div>
          {hidden.length > 0 && (
            <button onClick={() => setShowHidden((v) => !v)} className="text-[11px] font-semibold text-brand-gold transition hover:underline">
              {showHidden ? "Hide checked-off" : `Show checked-off (${hidden.length})`}
            </button>
          )}
        </div>
        {worklist.length === 0 ? (
          <p className="mt-3 text-sm text-brand-grey dark:text-slate-400">No one in onboarding right now.</p>
        ) : (
          <div className="mt-2 divide-y divide-brand-lea/5 dark:divide-white/10">
            {worklist.map((p) => (
              <WorklistRow key={p.id} p={p} onHide={() => setHiddenState(p, true)} />
            ))}
          </div>
        )}
        {showHidden && hidden.length > 0 && (
          <div className="mt-3 border-t border-brand-lea/10 pt-2 dark:border-white/10">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">Checked off · {hidden.length}</p>
            <div className="divide-y divide-brand-lea/5 opacity-70 dark:divide-white/10">
              {hidden.map((p) => (
                <WorklistRow key={p.id} p={p} onRestore={() => setHiddenState(p, false)} />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Bottlenecks + orientation timing + travel readiness */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Where it&apos;s jamming</h2>
          <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">Onboarding tasks still to-do across the most active hires</p>
          <div className="mt-3">
            {dashboard.bottlenecks.length === 0 ? (
              <p className="text-sm text-brand-grey dark:text-slate-400">Nothing outstanding — every active hire is caught up.</p>
            ) : (
              <HBars data={dashboard.bottlenecks} color="#d8772f" />
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
            <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Orientation timing</h2>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-semibold text-brand-lea dark:text-slate-100">{dashboard.orientationTimeliness.pct}%</span>
              <span className="text-xs text-brand-grey dark:text-slate-400">scheduled within a month of start</span>
            </div>
            <SegBar
              segments={[
                { value: dashboard.orientationTimeliness.onTime, color: "#2e7d32" },
                { value: dashboard.orientationTimeliness.outsideMonth, color: "#e2904a" },
                { value: dashboard.orientationTimeliness.unscheduled, color: "#c9c7bf" }
              ]}
            />
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-brand-grey dark:text-slate-400">
              <span><b className="text-emerald-700 dark:text-emerald-300">{dashboard.orientationTimeliness.onTime}</b> within a month</span>
              <span><b className="text-amber-700 dark:text-amber-300">{dashboard.orientationTimeliness.outsideMonth}</b> outside a month</span>
              <span><b>{dashboard.orientationTimeliness.unscheduled}</b> no date</span>
              <span>of {dashboard.orientationTimeliness.total} with a start date</span>
            </div>
          </div>

          <div className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
            <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Travel readiness</h2>
            <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">Upcoming starters · {dashboard.travelReadiness.total}</p>
            <SegBar
              segments={[
                { value: dashboard.travelReadiness.booked, color: "#2e7d32" },
                { value: dashboard.travelReadiness.needed, color: "#e2904a" },
                { value: dashboard.travelReadiness.none, color: "#c9c7bf" }
              ]}
            />
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-brand-grey dark:text-slate-400">
              <span><b className="text-emerald-700 dark:text-emerald-300">{dashboard.travelReadiness.booked}</b> booked</span>
              <span><b className="text-amber-700 dark:text-amber-300">{dashboard.travelReadiness.needed}</b> needs booking</span>
              <span><b>{dashboard.travelReadiness.none}</b> no travel logged</span>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <h2 className="mb-3 text-base font-semibold text-brand-lea dark:text-slate-100">By status</h2>
          <Donut data={dashboard.byStatus} />
        </div>
        <div className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <h2 className="mb-3 text-base font-semibold text-brand-lea dark:text-slate-100">By department</h2>
          <HBars data={dashboard.byDepartment} color="#1d6fb8" />
        </div>
        <div className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <h2 className="mb-3 text-base font-semibold text-brand-lea dark:text-slate-100">Starts by week</h2>
          <VBars data={dashboard.startsByWeek} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <h2 className="mb-3 text-base font-semibold text-brand-lea dark:text-slate-100">Where active hires are in the process</h2>
          <HBars data={dashboard.funnel} color="#2e7d32" />
        </div>
        <div className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Needs attention</h2>
          <div className="mt-3 space-y-1 rounded border border-brand-lea/10 p-1.5 dark:border-white/10">
            {dashboard.alerts.length === 0 ? (
              <p className="px-3 py-4 text-sm text-brand-grey dark:text-slate-400">Nothing flagged — every active hire is on track.</p>
            ) : (
              dashboard.alerts.map((a, i) => {
                const s = ALERT_STYLE[a.level];
                return (
                  <Link
                    key={`${a.id}-${i}`}
                    href={`/people/${a.id}`}
                    className={clsx("flex items-center justify-between gap-3 rounded px-4 py-2.5 text-sm transition-shadow hover:shadow-glow", s.row)}
                  >
                    <span className="text-brand-black dark:text-slate-100">
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

      <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Upcoming start dates</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {dashboard.upcomingStarts.length === 0 ? (
            <p className="text-sm text-brand-grey dark:text-slate-400">No upcoming starts.</p>
          ) : (
            dashboard.upcomingStarts.map((u) => (
              <Link key={u.id} href={`/people/${u.id}`} className="flex items-center gap-3 rounded px-4 py-2.5 text-sm transition-shadow hover:shadow-glow">
                <span className="w-14 shrink-0 font-semibold text-sky-700 dark:text-sky-300">{fmtDate(u.startDate)}</span>
                <span className="truncate text-brand-black dark:text-slate-100">
                  {u.name}
                  {u.position ? <span className="text-brand-grey dark:text-slate-400"> · {u.position}</span> : null}
                </span>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
