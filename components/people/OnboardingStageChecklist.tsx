"use client";

import { useMemo, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import type { TaskView } from "@/lib/data/onboarding";

// The bottom half of /people/<id>: what to do next, then one stage at a time
// instead of every group stacked down the page. The whole checklist is still
// here — it is behind four tabs rather than four headings, which is what took
// the page from one long scroll to one screen.

export type StageGroup = {
  key: string;
  label: string;
  items: TaskView[];
};

const STATUS_BTN: Record<TaskView["status"], { label: string; on: string }> = {
  DONE: { label: "Done", on: "bg-emerald-500 text-white" },
  TODO: { label: "To do", on: "bg-brand-lea text-white" },
  NA: { label: "N/A", on: "bg-brand-grey text-white" }
};

type Props = {
  groups: StageGroup[];
  onSetStatus: (taskId: string, next: TaskView["status"]) => void;
  /** Per-task controls that are not the status buttons — the two Front send buttons. */
  renderTaskExtra?: (task: TaskView) => ReactNode;
};

export function OnboardingStageChecklist({ groups, onSetStatus, renderTaskExtra }: Props) {
  // The first stage that still has something outstanding. Landing here means the
  // tab you open is the tab you needed, without picking one.
  const nextGroupIndex = useMemo(() => {
    const i = groups.findIndex((g) => g.items.some((t) => t.status === "TODO"));
    return i === -1 ? Math.max(0, groups.length - 1) : i;
  }, [groups]);

  const [active, setActive] = useState<number | null>(null);
  const shown = active ?? nextGroupIndex;

  // The single next thing to do, in stage order — the same order the tabs are in.
  const next = useMemo(() => {
    for (const g of groups) {
      const t = g.items.find((x) => x.status === "TODO");
      if (t) return { task: t, group: g };
    }
    return null;
  }, [groups]);

  const current = groups[shown];

  return (
    <div className="space-y-3.5">
      <div className="h-[3px] rounded bg-gradient-to-r from-brand-lea to-brand-eden" />

      {next ? (
        <div className="flex flex-wrap items-center gap-3 rounded bg-gradient-to-r from-[#fdf6e3] to-[#fffdf7] px-3.5 py-2.5 ring-1 ring-brand-gold/45 dark:from-brand-gold/10 dark:to-transparent dark:ring-brand-gold/30">
          <span className="shrink-0 rounded bg-brand-gold px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.13em] text-brand-lea">
            Next
          </span>
          <span className="min-w-0 flex-1 font-semibold text-brand-lea dark:text-slate-100">{next.task.label}</span>
          <span className="shrink-0 text-sm text-brand-grey dark:text-slate-400">{next.group.label}</span>
          <button
            type="button"
            onClick={() => onSetStatus(next.task.id, "DONE")}
            className="shrink-0 rounded bg-brand-lea px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-eden hover:shadow-glow"
          >
            Mark done
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded bg-emerald-50 px-3.5 py-2.5 ring-1 ring-emerald-500/40 dark:bg-emerald-500/10 dark:ring-emerald-400/30">
          <span className="shrink-0 rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.13em] text-white">
            Clear
          </span>
          <span className="min-w-0 flex-1 font-semibold text-brand-lea dark:text-slate-100">
            Every applicable item is done.
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Onboarding stages">
        {groups.map((g, i) => {
          const done = g.items.filter((t) => t.status === "DONE").length;
          const outstanding = g.items.some((t) => t.status === "TODO");
          const on = i === shown;
          return (
            <button
              key={g.key}
              role="tab"
              type="button"
              aria-selected={on}
              onClick={() => setActive(i)}
              className={clsx(
                "flex items-center gap-2 rounded border px-3.5 py-2 text-sm transition hover:shadow-glow",
                on
                  ? "border-brand-lea bg-brand-lea font-semibold text-white shadow-[inset_0_-3px_0_theme(colors.brand.gold)]"
                  : "border-brand-lea/10 bg-white text-brand-grey dark:border-white/10 dark:bg-brand-panel dark:text-slate-400"
              )}
            >
              {g.label}
              <span
                className={clsx(
                  "rounded px-1.5 py-0.5 text-[11px] font-bold",
                  outstanding
                    ? "bg-brand-gold text-brand-lea"
                    : on
                      ? "bg-white/20 text-white"
                      : "bg-brand-lea/10 text-brand-eden dark:bg-white/10 dark:text-brand-edenOnDark"
                )}
              >
                {done}/{g.items.length}
              </span>
            </button>
          );
        })}
      </div>

      <section
        role="tabpanel"
        className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10"
      >
        {current && current.items.length > 0 ? (
          <div className="space-y-1.5">
            {current.items.map((t) => {
              const isNext = next?.task.id === t.id;
              return (
                <div
                  key={t.id}
                  className={clsx(
                    "flex flex-wrap items-center justify-between gap-3 rounded px-3 py-2 transition",
                    isNext
                      ? "bg-gradient-to-r from-brand-gold/15 to-brand-gold/[0.03] ring-1 ring-brand-gold/40"
                      : "border border-brand-lea/10 dark:border-white/10"
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={clsx(
                        "h-2.5 w-2.5 shrink-0 rounded-full",
                        t.status === "DONE"
                          ? "bg-emerald-500"
                          : t.status === "NA"
                            ? "bg-brand-lea/25 dark:bg-white/20"
                            : "bg-brand-gold"
                      )}
                    />
                    <span
                      className={clsx(
                        "text-sm",
                        t.status === "DONE"
                          ? "text-brand-grey line-through dark:text-slate-400"
                          : t.status === "NA"
                            ? "text-brand-grey/70 dark:text-slate-500"
                            : clsx("text-brand-black dark:text-slate-100", isNext && "font-semibold text-brand-lea")
                      )}
                    >
                      {t.label}
                    </span>
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    {renderTaskExtra?.(t)}
                    <div className="flex shrink-0 overflow-hidden rounded border border-brand-lea/15 dark:border-white/10">
                      {(["TODO", "DONE", "NA"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => onSetStatus(t.id, s)}
                          className={clsx(
                            "px-2.5 py-1 text-xs font-semibold transition hover:shadow-glow",
                            t.status === s
                              ? STATUS_BTN[s].on
                              : "bg-white text-brand-grey hover:bg-brand-cloudDancer/60 dark:bg-brand-panel dark:text-slate-400"
                          )}
                        >
                          {STATUS_BTN[s].label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-2 text-sm text-brand-grey dark:text-slate-400">Nothing on this stage.</p>
        )}
      </section>
    </div>
  );
}
