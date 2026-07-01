"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Loader, ChevronDown, RotateCcw } from "lucide-react";

interface MergedJob {
  id: string;
  title: string;
  status: string;
  mergedInto: { id: string; title: string } | null;
  mergedAt: string;
  mergedBy: string | null;
  reversible: { applications: number; interviews: number } | null;
}

export function JobMergedHistory() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MergedJob[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unmergingId, setUnmergingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/jobs/merged");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load merged jobs.");
      setItems(data.merged ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load merged jobs.");
    } finally {
      setLoading(false);
    }
  }, []);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && items === null) load();
  }

  async function handleUnmerge(jobId: string) {
    setUnmergingId(jobId);
    setMessage(null);
    try {
      const res = await fetch("/api/jobs/unmerge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result?.message ?? result?.error ?? "Unmerge failed.");
      }
      setMessage({ type: "success", text: result.message });
      await load();
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Unmerge failed." });
    } finally {
      setUnmergingId(null);
    }
  }

  return (
    <section className="mt-4 rounded border border-brand-lea/10 bg-white dark:border-white/10 dark:bg-brand-panel">
      <button
        onClick={toggleOpen}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-brand-cloudDancer/20 hover:shadow-glow dark:bg-white/5"
      >
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">Merged job history</p>
          <h3 className="text-sm font-semibold text-brand-lea dark:text-slate-100">
            Previously merged jobs{items ? ` (${items.length})` : ""}
          </h3>
        </div>
        <ChevronDown className={`h-5 w-5 text-brand-grey transition-transform dark:text-slate-400 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-brand-lea/10 p-3 dark:border-white/10">
          {message && (
            <div
              className={`mb-3 rounded p-3 text-sm ${
                message.type === "success"
                  ? "border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "border border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300"
              }`}
            >
              {message.text}
            </div>
          )}

          {loading && (
            <div className="flex justify-center py-6">
              <Loader className="h-5 w-5 animate-spin text-brand-lea dark:text-slate-100" />
            </div>
          )}

          {error && !loading && (
            <div className="rounded border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15 px-3 py-2 text-sm text-red-900">{error}</div>
          )}

          {!loading && !error && items && items.length === 0 && (
            <p className="px-2 py-4 text-center text-sm text-brand-grey dark:text-slate-400">No jobs have been merged yet.</p>
          )}

          {!loading && items && items.length > 0 && (
            <div className="space-y-2">
              {items.map((job) => (
                <div
                  key={job.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded border border-brand-lea/10 bg-brand-cloudDancer/20 p-3 dark:border-white/10 dark:bg-white/5"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-brand-lea dark:text-slate-100">{job.title}</div>
                    <div className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
                      merged into{" "}
                      {job.mergedInto ? (
                        <Link
                          href={`/recruiting-jobs?id=${job.mergedInto.id}`}
                          target="_blank"
                          className="font-medium text-brand-lea underline hover:text-brand-gold transition hover:shadow-glow dark:text-slate-100"
                        >
                          {job.mergedInto.title}
                        </Link>
                      ) : (
                        "another job"
                      )}
                      {" • "}
                      {new Date(job.mergedAt).toLocaleDateString()}
                      {job.mergedBy ? ` • by ${job.mergedBy}` : ""}
                    </div>
                    <div className="mt-1 text-[11px] text-brand-grey dark:text-slate-400">
                      {job.reversible
                        ? `Unmerge restores ${job.reversible.applications} application${
                            job.reversible.applications === 1 ? "" : "s"
                          } and ${job.reversible.interviews} interview${
                            job.reversible.interviews === 1 ? "" : "s"
                          }.`
                        : "Legacy merge — unmerge restores the job, but moved applications/interviews stay with the kept job."}
                    </div>
                  </div>

                  <button
                    onClick={() => handleUnmerge(job.id)}
                    disabled={unmergingId !== null}
                    className="flex items-center gap-2 rounded border border-brand-lea/20 px-3 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-sweet/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-slate-100"
                  >
                    {unmergingId === job.id ? (
                      <Loader className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4" />
                    )}
                    Unmerge
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
