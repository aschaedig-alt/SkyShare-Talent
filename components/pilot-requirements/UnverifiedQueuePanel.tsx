"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { ChevronDown, CircleHelp, FileWarning, RefreshCw } from "lucide-react";
import { loadUnverifiedForRequirement } from "@/app/pilot-requirements/scoring-actions";
import type { UnverifiedCandidate } from "@/lib/matching/pilot-requirement-matches";

/**
 * The data-cleanup queue: everyone this position's scan had to hold back
 * because a HARD requirement has no evidence either way.
 *
 * Ordered fewest-gaps-first, because that is the work order — someone missing
 * one field is a minute of data entry, someone missing seven has probably never
 * had a document read at all. Loaded on demand: it rescores the whole pool.
 */
/** How many rows to render at a time — the full queue can run to thousands. */
const RENDER_STEP = 75;

export function UnverifiedQueuePanel({
  requirementId,
  includeExcluded = false
}: {
  requirementId: string | null;
  includeExcluded?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<UnverifiedCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startLoad] = useTransition();
  // Defaults to the live pipeline. A real G200 scan puts 2,587 people in this
  // queue and roughly 2,300 of them are archived Jazz records — useful once,
  // but they would bury the live candidates this list exists to fix.
  const [scope, setScope] = useState<"current" | "all">("current");
  const [limit, setLimit] = useState(RENDER_STEP);

  function load() {
    if (!requirementId) return;
    setError(null);
    startLoad(async () => {
      const res = await loadUnverifiedForRequirement(requirementId, includeExcluded);
      if (res.ok && res.data) setRows(res.data.rows);
      else setError(res.error ?? "Could not build the cleanup queue.");
    });
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && rows === null && !pending) load();
  }

  if (!requirementId) return null;

  const scoped = rows ? (scope === "current" ? rows.filter((row) => !row.fromArchive) : rows) : null;
  const archiveCount = rows ? rows.length - rows.filter((row) => !row.fromArchive).length : 0;
  const noText = scoped?.filter((row) => row.noDocumentText).length ?? 0;
  const quickWins = scoped?.filter((row) => row.missingData.length === 1).length ?? 0;
  const shown = scoped?.slice(0, limit) ?? [];

  return (
    <div className="overflow-hidden rounded border border-brand-lea/15 dark:border-white/10">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 bg-brand-cloudDancer/50 px-3 py-2 text-left transition hover:bg-brand-cloudDancer dark:bg-white/5 dark:hover:bg-white/10"
      >
        <span className="flex min-w-0 items-center gap-2">
          <CircleHelp className="h-3.5 w-3.5 shrink-0 text-brand-grey dark:text-slate-400" />
          <span className="text-[11px] font-semibold text-brand-lea dark:text-slate-100">Missing data — cleanup queue</span>
          {scoped ? <span className="text-xs text-brand-grey dark:text-slate-400">({scoped.length})</span> : null}
        </span>
        <ChevronDown className={clsx("h-4 w-4 shrink-0 text-brand-grey transition-transform dark:text-slate-400", !open && "-rotate-90")} />
      </button>

      {open ? (
        <div className="space-y-3 p-3">
          <p className="text-[11px] text-brand-grey dark:text-slate-400">
            Held out of the ranked lists because a hard requirement has no evidence either way — a data gap, not a
            rejection. Ordered fewest gaps first, so the quickest wins are at the top.
          </p>

          {pending ? (
            <p className="flex items-center gap-2 text-[11px] font-medium text-brand-eden dark:text-slate-300">
              <RefreshCw className="h-3 w-3 animate-spin" /> Rescoring the pool…
            </p>
          ) : null}

          {error ? (
            <p className="rounded-element bg-value-customerFocus-light px-2.5 py-1.5 text-[11px] font-medium text-value-customerFocus-dark">
              {error}
            </p>
          ) : null}

          {scoped && !pending ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ["current", "Live pipeline"],
                  ["all", `Include archive (+${archiveCount.toLocaleString()})`]
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setScope(key);
                    setLimit(RENDER_STEP);
                  }}
                  className={clsx(
                    "rounded-element px-2 py-0.5 text-[11px] font-semibold transition",
                    scope === key
                      ? "bg-brand-lea text-white"
                      : "text-brand-grey hover:bg-brand-cloudDancer dark:text-slate-400 dark:hover:bg-white/10"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}

          {scoped && !pending ? (
            scoped.length === 0 ? (
              <p className="text-[11px] font-medium text-value-teamwork-dark">
                {scope === "current"
                  ? "Nothing missing in the live pipeline for this position."
                  : "Nothing missing — every candidate has evidence for this position's hard requirements."}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-3 text-[11px] text-brand-grey dark:text-slate-400">
                  <span>
                    <span className="font-semibold text-brand-lea dark:text-slate-100">{quickWins}</span> one field away
                  </span>
                  <span>
                    <span className="font-semibold text-brand-lea dark:text-slate-100">{noText}</span> with no readable
                    document at all
                  </span>
                </div>

                <ul className="divide-y divide-brand-lea/10 dark:divide-white/10">
                  {shown.map((row) => (
                    <li key={row.candidateId} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-1.5">
                      <Link
                        href={`/candidates/${row.candidateId}`}
                        className="text-[12px] font-semibold text-brand-lea transition hover:text-brand-eden dark:text-slate-100"
                      >
                        {row.candidateName}
                      </Link>
                      <span
                        className={clsx(
                          "rounded px-1.5 text-[9px] font-bold uppercase tracking-wide",
                          row.missingData.length === 1
                            ? "bg-value-teamwork-light text-value-teamwork-dark"
                            : "bg-brand-lea/8 text-brand-eden dark:bg-white/10 dark:text-[#8fb3d6]"
                        )}
                      >
                        {row.missingData.length} missing
                      </span>
                      {row.noDocumentText ? (
                        <span
                          title="No extracted document text on file — nothing to read hours from"
                          className="inline-flex items-center gap-1 rounded bg-value-customerFocus-light px-1.5 text-[9px] font-bold uppercase tracking-wide text-value-customerFocus-dark"
                        >
                          <FileWarning className="h-2.5 w-2.5" /> no document
                        </span>
                      ) : null}
                      {row.fromArchive ? (
                        <span className="rounded bg-brand-sweet/30 px-1.5 text-[9px] font-bold uppercase tracking-wide text-brand-eden dark:bg-white/10 dark:text-slate-300">
                          archive
                        </span>
                      ) : null}
                      <span className="min-w-0 flex-1 truncate text-[11px] text-brand-grey dark:text-slate-400">
                        {row.missingData.join(" · ")}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* Never let a truncated list read as a complete one. */}
                {shown.length < scoped.length ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[11px] text-brand-grey dark:text-slate-400">
                      Showing {shown.length.toLocaleString()} of {scoped.length.toLocaleString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => setLimit((value) => value + RENDER_STEP)}
                      className="rounded-element bg-brand-lea px-2 py-0.5 text-[11px] font-semibold text-white transition hover:bg-brand-eden"
                    >
                      Show {Math.min(RENDER_STEP, scoped.length - shown.length)} more
                    </button>
                  </div>
                ) : (
                  <span className="text-[11px] text-brand-grey dark:text-slate-400">
                    Showing all {scoped.length.toLocaleString()}
                  </span>
                )}
              </>
            )
          ) : null}

          {rows && !pending ? (
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-eden transition hover:text-brand-lea dark:text-slate-100"
            >
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
