"use client";

import { useCallback, useState } from "react";
import { Loader, ChevronDown, ChevronRight, Undo2 } from "lucide-react";
import type { DismissedPair } from "@/lib/jobs/duplicate-detection";
import { formatCalendarDay } from "@/lib/dates/display";

/**
 * Every "not duplicates" decision, with a way to take one back.
 *
 * Asked for on 2026-09-09. These decisions used to be write-only: 66 existed, no
 * screen listed them, and nothing called the DELETE endpoint that could undo one.
 * That mattered more than it looked, because until the fix shipped alongside this,
 * dismissing a pair removed BOTH jobs from every later scan rather than hiding that
 * single pairing. So the whole backlog was recorded under a rule nobody intended
 * and some of it was probably clicked just to clear noise off the screen.
 *
 * Collapsed by default: it is a long list and it is not the main job of this page.
 * No height cap and no inner scrollbar when open, per the house rule — the page
 * scrolls, the panel does not.
 */
export function JobDismissedPairs({ initialPairs = [] }: { initialPairs?: DismissedPair[] }) {
  const [pairs, setPairs] = useState<DismissedPair[]>(initialPairs);
  const [open, setOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/jobs/duplicates/dismiss");
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? "Could not reload the dismissed pairs.");
    setPairs(data.pairs ?? []);
  }, []);

  async function restore(pair: DismissedPair) {
    const key = `${pair.jobIdA}|${pair.jobIdB}`;
    setBusyKey(key);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/jobs/duplicates/dismiss", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairs: [[pair.jobIdA, pair.jobIdB]] })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not restore that pair.");
      await refresh();
      setNote(
        pair.stale
          ? "Record removed. That pairing could not have shown up in a scan anyway."
          : "Restored. Re-scan above to see the pair again."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not restore that pair.");
    } finally {
      setBusyKey(null);
    }
  }

  const live = pairs.filter((p) => !p.stale);
  const stale = pairs.filter((p) => p.stale);

  return (
    <section className="rounded border border-brand-lea/10 bg-white dark:border-white/10 dark:bg-brand-panel">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-brand-gold/10"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4 text-brand-grey dark:text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-brand-grey dark:text-slate-400" />
          )}
          <h3 className="font-semibold text-brand-lea dark:text-slate-100">Dismissed as not duplicates</h3>
          <span className="rounded bg-brand-cloudDancer px-2 py-0.5 text-[10px] font-bold uppercase text-brand-lea dark:bg-white/10 dark:text-slate-200">
            {pairs.length} {pairs.length === 1 ? "pair" : "pairs"}
          </span>
        </div>
        <span className="text-xs text-brand-grey dark:text-slate-400">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="border-t border-brand-lea/10 dark:border-white/10">
          <p className="px-4 py-3 text-xs text-brand-grey dark:text-slate-400">
            Each of these is a decision that two jobs are not the same role, so the scan stops offering them. Restore
            one to put it back in front of you. Dismissing a group records every pairing inside it, not just the one
            you had in mind, which is why there are usually more of these than clicks you remember making.
          </p>

          {error && (
            <div
              role="alert"
              className="mx-4 mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300"
            >
              {error}
            </div>
          )}
          {note && (
            <div className="mx-4 mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
              {note}
            </div>
          )}

          {pairs.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-brand-grey dark:text-slate-400">
              Nothing has been dismissed. Every pair the scan finds is still being offered.
            </p>
          ) : (
            <ul className="divide-y divide-brand-lea/10 dark:divide-white/10">
              {[...live, ...stale].map((pair) => {
                const key = `${pair.jobIdA}|${pair.jobIdB}`;
                return (
                  <li key={key} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-brand-lea dark:text-slate-100">
                        {pair.titleA} <span className="font-normal text-brand-grey dark:text-slate-400">vs</span>{" "}
                        {pair.titleB}
                      </p>
                      <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
                        {[pair.locationA, pair.locationB].filter(Boolean).join(" · ") || "No location recorded"}
                        {" · "}
                        {pair.statusA}/{pair.statusB}
                        {pair.similarity > 0 ? ` · ${pair.similarity}% alike` : ""}
                      </p>
                      <p className="mt-0.5 text-[11px] text-brand-grey dark:text-slate-500">
                        Dismissed {formatCalendarDay(pair.createdAt)}
                        {pair.createdBy ? ` by ${pair.createdBy}` : ""}
                      </p>
                      {pair.staleReason && (
                        <p className="mt-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                          {pair.staleReason}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void restore(pair)}
                      disabled={busyKey !== null}
                      className="flex shrink-0 items-center gap-1.5 rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-grey transition hover:bg-brand-gold/20 hover:text-brand-lea disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-brand-gold/20 dark:hover:text-slate-100"
                    >
                      {busyKey === key ? (
                        <Loader className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Undo2 className="h-3.5 w-3.5" />
                      )}
                      Restore
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
