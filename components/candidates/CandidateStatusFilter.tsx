"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { ListFilter, X, Check } from "lucide-react";
import type { CandidateStage } from "@/lib/candidates/stages";
import { tagChipClass } from "@/lib/tags/colors";
import { hrefWithParam } from "@/lib/candidates/list-url";

/**
 * Narrow the candidate list by pipeline stage.
 *
 * OR across stages, like the department filter and unlike the tag filter: a
 * candidate has exactly one stage, so ANDing two would always return nobody.
 * The menu says so, because two adjacent filters that combine their selections
 * differently is otherwise a trap.
 *
 * Grouped Open/Closed with a select-all on each, since "show me everyone still
 * in play" is the common ask and picking five stages by hand to get it is not.
 *
 * router.push rather than a Link: this re-queries the page you are on, it does
 * not navigate to another one.
 */
export function CandidateStatusFilter({
  active,
  stages,
  counts
}: {
  active: string[];
  /** The live vocabulary, so the menu matches the manage page. */
  stages: CandidateStage[];
  /** How many candidates sit on each stage, keyed lowercase. */
  counts?: Record<string, number>;
}) {
  const router = useRouter();
  // The live URL, so this control can only ever change its own parameter and a
  // filter added later cannot be dropped by one that has never heard of it.
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const activeSet = useMemo(() => new Set(active.map((a) => a.toLowerCase())), [active]);

  function apply(next: string[]) {
    router.push(hrefWithParam(searchParams, "stages", next));
  }

  function toggle(value: string) {
    apply(
      activeSet.has(value.toLowerCase())
        ? active.filter((s) => s.toLowerCase() !== value.toLowerCase())
        : [...active, value]
    );
  }

  const groups: Array<{ label: "Open" | "Closed"; items: CandidateStage[] }> = [
    { label: "Open", items: stages.filter((s) => s.group === "Open") },
    { label: "Closed", items: stages.filter((s) => s.group === "Closed") }
  ];

  /** Select or clear a whole group in one click. */
  function toggleGroup(items: CandidateStage[]) {
    const values = items.map((i) => i.value);
    const allOn = values.every((v) => activeSet.has(v.toLowerCase()));
    apply(
      allOn
        ? active.filter((a) => !values.some((v) => v.toLowerCase() === a.toLowerCase()))
        : [...new Set([...active, ...values])]
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-semibold transition",
          active.length
            ? "border-brand-gold bg-brand-gold/15 text-brand-lea dark:text-slate-100"
            : "border-brand-lea/20 text-brand-lea hover:bg-brand-gold/10 dark:border-white/10 dark:text-slate-100"
        )}
      >
        <ListFilter className="h-3.5 w-3.5" />
        {active.length
          ? `${active.length} status${active.length === 1 ? "" : "es"}`
          : "Filter by status"}
      </button>

      {active.length > 0 ? (
        <button
          onClick={() => apply([])}
          className="ml-1 inline-flex items-center gap-1 rounded border border-brand-lea/15 px-1.5 py-1 text-[11px] font-semibold text-brand-grey transition hover:text-brand-lea dark:border-white/10 dark:text-slate-400"
          title="Clear status filter"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}

      {open ? (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-1 w-64 rounded border border-brand-lea/15 bg-white p-2 shadow-panel dark:border-white/10 dark:bg-brand-panel">
            {active.length > 1 ? (
              <p className="mb-1.5 text-[10.5px] leading-snug text-brand-grey dark:text-slate-400">
                Showing people on <span className="font-semibold">any</span> of the selected statuses.
              </p>
            ) : null}

            {groups.map((group) =>
              group.items.length ? (
                <div key={group.label} className="mb-1.5 last:mb-0">
                  <button
                    onClick={() => toggleGroup(group.items)}
                    className="mb-0.5 flex w-full items-center justify-between rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey transition hover:bg-brand-gold/10 dark:text-slate-400"
                  >
                    {group.label}
                    <span className="text-[10px] font-semibold normal-case tracking-normal">
                      select all
                    </span>
                  </button>
                  {group.items.map((stage) => {
                    const on = activeSet.has(stage.value.toLowerCase());
                    const count = counts?.[stage.value.toLowerCase()];
                    return (
                      <button
                        key={stage.value}
                        onClick={() => toggle(stage.value)}
                        className={clsx(
                          "flex w-full items-center gap-2 rounded px-1.5 py-1 text-left transition hover:bg-brand-gold/10",
                          on && "bg-brand-gold/15"
                        )}
                      >
                        <span
                          className={clsx(
                            "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                            on
                              ? "border-brand-gold bg-brand-gold text-white"
                              : "border-brand-lea/25 dark:border-white/20"
                          )}
                        >
                          {on ? <Check className="h-2.5 w-2.5" /> : null}
                        </span>
                        <span
                          className={clsx(
                            "min-w-0 flex-1 truncate rounded border px-1.5 py-px text-[11px] font-semibold",
                            tagChipClass(stage.value, stage.color)
                          )}
                        >
                          {stage.value}
                        </span>
                        {typeof count === "number" ? (
                          <span className="shrink-0 text-[10.5px] tabular-nums text-brand-grey dark:text-slate-400">
                            {count.toLocaleString()}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null
            )}

            <div className="mt-1.5 border-t border-brand-lea/10 pt-1.5 dark:border-white/10">
              <p className="text-[10px] leading-snug text-brand-grey dark:text-slate-500">
                The status on the candidate, not the outcome of their last application. Edit the list
                on the manage page.
              </p>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
