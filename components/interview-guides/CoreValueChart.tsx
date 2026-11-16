"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, PieChart, Hash } from "lucide-react";
import { COMPANY_VALUES } from "@/lib/compliments/constants";
import { R } from "@/components/reports/report-ui";
import type { GuideItemView } from "@/lib/data/interview-guides";

// "Core values heard in the answers" on the guide page — his ask, Nov 16 2026:
// a list of question numbers ("Q1, Q7, Q9, Q12") does not help on an 18-question
// guide; he wants to SEE how many answers touched each value, and to switch the
// view himself between a bar chart, a pie chart and plain numbers, in the real
// page and not just a preview.
//
// What counts: an answer TOUCHES a value when the question has an answer typed
// (and is not marked Did not answer) and the value is either one the question
// was written for ("asked") or one ticked as "also showed". One answer can touch
// several values, so the four counts can add up to more than the answers.
//
// Colours are each value's own colour from the Compliments palette
// (tailwind.config.ts value-*), so a value looks the same everywhere in the app.
// Checked with the dataviz validator Nov 16 2026: all checks pass in light and
// dark (worst colour-blind pair, Deliver the Wow vs Team Alignment, dE 9.4).
// Every mark also carries its name and number, so colour is never the only cue.

type View = "bars" | "pie" | "numbers";
const VIEW_KEY = "skyshare.guide.coreValueView";

const HEX: Record<string, string> = {
  innovation: "#378add",
  teamwork: "#1d9e75",
  customerFocus: "#d85a30",
  growthMindset: "#7f77dd"
};

type Row = { key: string; name: string; color: string; asked: number[]; also: number[]; total: number };

const answeredOf = (it: GuideItemView) => !it.skipped && Boolean((it.answer ?? "").replace(/<[^>]*>/g, "").trim()) && it.strength !== "NOT_ANSWERED";

function useStoredView(): [View, (v: View) => void] {
  const [view, setView] = useState<View>("bars");
  // Per-viewer convenience only; the page works the same without storage.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_KEY);
      if (saved === "bars" || saved === "pie" || saved === "numbers") setView(saved);
    } catch {
      /* storage blocked */
    }
  }, []);
  return [
    view,
    (v: View) => {
      setView(v);
      try {
        window.localStorage.setItem(VIEW_KEY, v);
      } catch {
        /* storage blocked */
      }
    }
  ];
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const qList = (ns: number[]) => ns.map((n) => `Q${n}`).join(", ");

function Bars({ rows, answered }: { rows: Row[]; answered: number }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      <ul className="space-y-2.5">
        {rows.map((r) => {
          const isOpen = open === r.key;
          return (
            <li key={r.key}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : r.key)}
                aria-expanded={isOpen}
                title={`${r.name}: ${r.total} of ${answered} answers. Click for the questions.`}
                className="grid w-full grid-cols-1 items-center gap-x-3 gap-y-1 rounded px-1 py-1 text-left transition hover:bg-brand-cloudDancer/50 sm:grid-cols-[10rem,minmax(0,1fr),7.5rem] dark:hover:bg-white/5"
              >
                <span className="text-sm font-semibold text-brand-lea dark:text-slate-100">{r.name}</span>
                {/* Track = every answered question; a full bar means every answer touched it. */}
                <span className="flex h-5 w-full overflow-hidden rounded bg-brand-lea/5 dark:bg-white/5">
                  {r.asked.length ? (
                    <span className="h-full" style={{ width: `${(r.asked.length / answered) * 100}%`, background: r.color }} />
                  ) : null}
                  {r.also.length ? (
                    <span
                      className="h-full border-l-2 border-white dark:border-brand-panel"
                      style={{
                        width: `${(r.also.length / answered) * 100}%`,
                        background: `repeating-linear-gradient(135deg, ${r.color} 0 4px, ${r.color}99 4px 7px)`
                      }}
                    />
                  ) : null}
                </span>
                <span className="text-sm tabular-nums text-brand-lea dark:text-slate-100 sm:text-right">
                  {r.total ? (
                    <>
                      <b className="font-semibold">{r.total}</b>
                      <span className="text-brand-grey dark:text-slate-400"> of {answered} · {pct(r.total, answered)}%</span>
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="h-3.5 w-3.5" /> Not heard
                    </span>
                  )}
                </span>
              </button>
              {isOpen ? (
                <p className="ml-1 mt-1 text-xs text-brand-grey dark:text-slate-400 sm:ml-[10.75rem]">
                  {r.asked.length ? <>Asked for and answered: <b className="text-brand-lea dark:text-slate-100">{qList(r.asked)}</b>. </> : null}
                  {r.also.length ? <>Also showed: <b className="text-brand-lea dark:text-slate-100">{qList(r.also)}</b>.</> : null}
                  {!r.total ? "No answer touched this value yet." : null}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className={R.legend}>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-brand-eden" /> Question was written for it
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm" style={{ background: "repeating-linear-gradient(135deg,#466481 0 3px,#46648199 3px 5px)" }} /> Answer also showed it
        </span>
        <span>Click a value to see which questions.</span>
      </div>
    </div>
  );
}

function Pie({ rows }: { rows: Row[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const sum = rows.reduce((a, r) => a + r.total, 0);
  const R0 = 70;
  const R1 = 44;
  let angle = -Math.PI / 2;
  const arcs = rows
    .filter((r) => r.total > 0)
    .map((r) => {
      const sweep = (r.total / sum) * Math.PI * 2;
      const a0 = angle;
      const a1 = angle + sweep;
      angle = a1;
      // A 2px surface gap between slices (the one-slice case is a full ring).
      const gap = rows.filter((x) => x.total > 0).length > 1 ? 0.02 : 0;
      const s = a0 + gap / 2;
      const e = a1 - gap / 2;
      const large = e - s > Math.PI ? 1 : 0;
      const p = (rad: number, a: number) => `${80 + rad * Math.cos(a)} ${80 + rad * Math.sin(a)}`;
      const d =
        sweep >= Math.PI * 2 - 0.001
          ? `M ${p(R0, 0)} A ${R0} ${R0} 0 1 1 ${p(R0, Math.PI)} A ${R0} ${R0} 0 1 1 ${p(R0, 0)} M ${p(R1, 0)} A ${R1} ${R1} 0 1 0 ${p(R1, Math.PI)} A ${R1} ${R1} 0 1 0 ${p(R1, 0)} Z`
          : `M ${p(R0, s)} A ${R0} ${R0} 0 ${large} 1 ${p(R0, e)} L ${p(R1, e)} A ${R1} ${R1} 0 ${large} 0 ${p(R1, s)} Z`;
      return { r, d };
    });
  const focus = rows.find((r) => r.key === hover) ?? null;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-8">
      <svg viewBox="0 0 160 160" className="h-44 w-44 shrink-0" role="img" aria-label={`Share of core value mentions: ${rows.map((r) => `${r.name} ${r.total}`).join(", ")}`}>
        {arcs.map(({ r, d }) => (
          <path
            key={r.key}
            d={d}
            fill={r.color}
            fillRule="evenodd"
            opacity={hover && hover !== r.key ? 0.35 : 1}
            onMouseEnter={() => setHover(r.key)}
            onMouseLeave={() => setHover(null)}
            className="cursor-pointer transition-opacity"
          >
            <title>{`${r.name}: ${r.total} (${pct(r.total, sum)}% of mentions)`}</title>
          </path>
        ))}
        <text x="80" y="76" textAnchor="middle" className="fill-brand-lea text-[22px] font-semibold dark:fill-slate-100">
          {focus ? focus.total : sum}
        </text>
        <text x="80" y="94" textAnchor="middle" className="fill-brand-grey text-[10px] dark:fill-slate-400">
          {focus ? `${pct(focus.total, sum)}% · ${focus.name.split(" ")[0]}` : "mentions"}
        </text>
      </svg>
      <ul className="w-full max-w-xs space-y-1.5">
        {rows.map((r) => (
          <li
            key={r.key}
            onMouseEnter={() => setHover(r.key)}
            onMouseLeave={() => setHover(null)}
            className={`flex items-center justify-between gap-3 rounded px-2 py-1 text-sm transition ${hover === r.key ? "bg-brand-cloudDancer/60 dark:bg-white/5" : ""}`}
          >
            <span className="inline-flex items-center gap-2 font-semibold text-brand-lea dark:text-slate-100">
              <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: r.color }} />
              {r.name}
            </span>
            {r.total ? (
              <span className="tabular-nums text-brand-lea dark:text-slate-100">
                {r.total} <span className="text-brand-grey dark:text-slate-400">· {pct(r.total, sum)}%</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" /> 0
              </span>
            )}
          </li>
        ))}
        <li className="px-2 pt-1 text-[11px] text-brand-grey dark:text-slate-400">
          Share of all value mentions. One answer can mention several values.
        </li>
      </ul>
    </div>
  );
}

function Numbers({ rows, answered }: { rows: Row[]; answered: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {rows.map((r) => (
        <div
          key={r.key}
          className={`rounded border p-3 ${r.total ? "border-brand-lea/10 bg-brand-cloudDancer/45 dark:border-white/10 dark:bg-white/5" : "border-amber-500 bg-amber-100 dark:border-amber-400/70 dark:bg-amber-500/20"}`}
          style={r.total ? { borderTop: `3px solid ${r.color}` } : undefined}
        >
          <div className={R.tileLabel}>{r.name}</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className={`text-3xl font-bold tabular-nums ${r.total ? "text-brand-lea dark:text-slate-100" : "text-amber-700 dark:text-amber-300"}`}>{r.total}</span>
            <span className={R.tileSub}>of {answered} answers</span>
          </div>
          <div className={R.tileSub}>
            {r.total ? `${pct(r.total, answered)}% · ${r.asked.length} asked, ${r.also.length} also showed` : "Not heard yet"}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CoreValueChart({ items }: { items: GuideItemView[] }) {
  const [view, setView] = useStoredView();
  const { rows, answered } = useMemo(() => {
    const answeredIdx = items.map((it, i) => (answeredOf(it) ? i + 1 : 0)).filter(Boolean);
    const rows: Row[] = COMPANY_VALUES.map((v) => {
      const asked: number[] = [];
      const also: number[] = [];
      items.forEach((it, i) => {
        if (!answeredOf(it)) return;
        // it.values already drops asked values that were unticked.
        if (!it.values.includes(v.colorKey)) return;
        if (it.coreValues.includes(v.colorKey)) asked.push(i + 1);
        else also.push(i + 1);
      });
      return { key: v.colorKey, name: v.name, color: HEX[v.colorKey] ?? "#888780", asked, also, total: asked.length + also.length };
    });
    return { rows, answered: answeredIdx.length };
  }, [items]);
  const missing = rows.filter((r) => r.total === 0).length;

  const views: Array<{ id: View; label: string; icon: typeof BarChart3 }> = [
    { id: "bars", label: "Bars", icon: BarChart3 },
    { id: "pie", label: "Pie", icon: PieChart },
    { id: "numbers", label: "Numbers", icon: Hash }
  ];

  return (
    <div className="mb-4 rounded border border-brand-lea/10 p-4 dark:border-white/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className={R.listTitle}>Core values heard in the answers</div>
          <div className={`${R.tileSub} mt-0.5`}>
            {answered} of {items.filter((it) => !it.skipped).length} questions answered
            {answered ? (
              missing ? (
                <span className="ml-2 inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-3 w-3" /> {missing} value{missing === 1 ? "" : "s"} not heard
                </span>
              ) : (
                <span className="ml-2 font-semibold text-emerald-700 dark:text-emerald-300">All four heard</span>
              )
            ) : null}
          </div>
        </div>
        <div className={R.segmentGroup} role="group" aria-label="Chart view">
          {views.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => setView(id)}
              className={`${R.segment} inline-flex items-center gap-1.5 ${view === id ? R.segmentOn : R.segmentOff}`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4">
        {answered === 0 ? (
          <p className="text-sm text-brand-grey dark:text-slate-400">No answers typed yet. The chart fills in as you type answers above.</p>
        ) : view === "pie" ? (
          <Pie rows={rows} />
        ) : view === "numbers" ? (
          <Numbers rows={rows} answered={answered} />
        ) : (
          <Bars rows={rows} answered={answered} />
        )}
      </div>
    </div>
  );
}
