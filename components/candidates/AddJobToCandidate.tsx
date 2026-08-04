"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Briefcase, X, Search, Plus, ArrowRight } from "lucide-react";
import { useDialogClose } from "@/lib/hooks/useDialogClose";

type FoundJob = { id: string; title: string; status: string; department: string | null; baseLocation: string | null };

const FIELD =
  "w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-black outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 dark:border-white/10 dark:bg-brand-panel dark:text-slate-100";

/**
 * Links a candidate to a job from the CANDIDATE side, so the offer can be worked
 * on their profile without the old detour out to the Jobs page and back. Uses the
 * same idempotent POST /api/candidate-applications the job side uses.
 *
 * When no job matches, an admin (jobs:write) can CREATE a bare job right here and
 * link it in one step — so a missing job doesn't force a trip out to Jobs and back.
 * The new job is title-only; a link in the confirmation nudges filling it in later.
 */
export function AddJobToCandidate({ candidateId, canCreateJob = false }: { candidateId: string; canCreateJob?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeJob, setNoticeJob] = useState<{ id: string; title: string } | null>(null);
  const [query, setQuery] = useState("");
  // null = the search for the CURRENT query hasn't resolved. Distinct from [],
  // which means the server really has no match — and the difference matters here
  // because "no match" is what unlocks the create-a-job button below. While the
  // debounce was running this rendered "No matching jobs" AND the create button
  // together, so a fast click created a near-duplicate of a job that existed.
  const [results, setResults] = useState<FoundJob[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open || notice) return;
    const ctrl = new AbortController();
    // Set BEFORE the timer, not inside it. Inside, the 200ms debounce window is
    // spent with searching=false over results that belong to the previous query.
    setSearching(true);
    setResults(null);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/recruiting-jobs?q=${encodeURIComponent(query)}`, { signal: ctrl.signal });
        if (res.ok) {
          const body = (await res.json()) as { jobs: FoundJob[] };
          setResults(body.jobs);
        } else {
          setError("Could not search jobs.");
        }
      } catch {
        /* aborted, or the request failed — results stay null, which keeps the
           create-a-new-job affordance locked rather than offering it off a search
           that never happened. */
      } finally {
        // A newer effect has already set this true; don't undo it.
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [open, query, notice]);

  function finish() {
    setOpen(false);
    setQuery("");
    setResults(null);
    setNotice(null);
    setNoticeJob(null);
    setError(null);
    router.refresh();
  }

  useDialogClose(finish, open);

  async function link(job: FoundJob) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/candidate-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, jobId: job.id })
      });
      const body = (await res.json().catch(() => ({}))) as { reused?: boolean; reactivated?: boolean };
      if (!res.ok) {
        setError("Could not link to that job.");
      } else if (body.reused) {
        setNotice(`Already linked to ${job.title} — nothing duplicated.`);
        router.refresh();
      } else if (body.reactivated) {
        setNotice(`Linked to ${job.title}. This candidate was archived, so linking brought them back into the active pipeline.`);
        router.refresh();
      } else {
        finish();
      }
    } catch {
      setError("Could not link to that job.");
    } finally {
      setBusy(false);
    }
  }

  // No job matched — make a bare one (title only) and link it in one step. If a job
  // with this title already exists (409), link to that instead of duplicating.
  async function createAndLink() {
    const title = query.trim();
    if (!title) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/recruiting-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title })
      });
      const body = (await res.json().catch(() => ({}))) as {
        job?: { id: string; title: string };
        existing?: { id: string; title: string };
        message?: string;
      };

      let jobId: string;
      let jobTitle: string;
      let createdNew: boolean;
      if (res.ok && body.job) {
        jobId = body.job.id;
        jobTitle = body.job.title;
        createdNew = true;
      } else if (res.status === 409 && body.existing) {
        jobId = body.existing.id;
        jobTitle = body.existing.title;
        createdNew = false;
      } else {
        setError(body.message ?? "Could not create the job.");
        return;
      }

      const linkRes = await fetch("/api/candidate-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, jobId })
      });
      if (!linkRes.ok) {
        setError(`Created “${jobTitle}”, but couldn't link the candidate to it.`);
        return;
      }

      setNotice(
        createdNew
          ? `Created “${jobTitle}” and linked it. It's a bare job — open it to add the department, location, and requirements when you can.`
          : `A job called “${jobTitle}” already existed, so linked to that one instead of adding a duplicate.`
      );
      setNoticeJob({ id: jobId, title: jobTitle });
      router.refresh();
    } catch {
      setError("Could not create the job.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded border border-brand-lea/20 px-2.5 py-1 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
      >
        <Briefcase className="h-3.5 w-3.5" /> Link to a job
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-lea/40 p-4" onClick={finish}>
          <div className="w-full max-w-md rounded bg-white p-5 shadow-xl dark:bg-brand-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">{notice ? "Done" : "Link to a job"}</h2>
              <button data-dialog-close onClick={finish} className="rounded p-1 text-brand-grey hover:text-brand-lea dark:text-slate-400" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            {notice ? (
              <div>
                <p className="rounded border border-brand-gold/40 bg-brand-sweet/12 p-3 text-sm text-brand-lea dark:bg-brand-gold/10 dark:text-slate-100">{notice}</p>
                {noticeJob ? (
                  <Link
                    href={`/recruiting-jobs?id=${noticeJob.id}`}
                    onClick={() => setOpen(false)}
                    className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-eden transition hover:underline dark:text-brand-sweet"
                  >
                    Open “{noticeJob.title}” to add details <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                ) : null}
                <div className="mt-4 flex justify-end">
                  <button onClick={finish} className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden dark:bg-brand-sweet dark:text-brand-lea">
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-grey dark:text-slate-400" />
                  <input autoFocus className={`${FIELD} pl-9`} placeholder="Search jobs by title or department" value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                <div className="max-h-64 space-y-1.5 overflow-y-auto">
                  {searching || results === null ? (
                    <p className="px-1 py-3 text-xs text-brand-grey dark:text-slate-400">
                      {searching ? "Searching jobs…" : "Couldn't search jobs. Edit the search to try again."}
                    </p>
                  ) : results.length > 0 ? (
                    results.map((j) => (
                      <button
                        key={j.id}
                        onClick={() => link(j)}
                        disabled={busy}
                        className="flex w-full items-center justify-between gap-2 rounded border border-brand-lea/10 bg-brand-cloudDancer/40 px-3 py-2 text-left transition-colors hover:bg-brand-gold/[0.07] disabled:opacity-60 dark:border-white/10 dark:bg-white/5"
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-semibold text-brand-lea dark:text-slate-100">{j.title}</span>
                            {j.status !== "OPEN" && (
                              <span className="shrink-0 rounded bg-brand-cloudDancer px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:bg-white/10 dark:text-slate-300">
                                {j.status.toLowerCase()}
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-xs text-brand-grey dark:text-slate-400">
                            {[j.department, j.baseLocation].filter(Boolean).join(" · ") || "No details"}
                          </span>
                        </span>
                        <Plus className="h-4 w-4 shrink-0 text-brand-eden" />
                      </button>
                    ))
                  ) : (
                    <div className="px-1 py-3">
                      <p className="text-xs text-brand-grey dark:text-slate-400">
                        No matching jobs{query.trim() ? "" : " — start typing to search"}.
                      </p>
                      {canCreateJob && query.trim() ? (
                        <button
                          onClick={createAndLink}
                          disabled={busy}
                          className="mt-2 flex w-full items-center justify-between gap-2 rounded border border-dashed border-brand-eden/40 bg-brand-sweet/10 px-3 py-2 text-left transition-colors hover:bg-brand-gold/[0.08] disabled:opacity-60 dark:border-white/15 dark:bg-white/5"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-brand-lea dark:text-slate-100">
                              Create “{query.trim()}” as a new job
                            </span>
                            <span className="block text-xs text-brand-grey dark:text-slate-400">Adds a bare job and links it now — fill in details later</span>
                          </span>
                          <Plus className="h-4 w-4 shrink-0 text-brand-eden" />
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
                {error && <p className="mt-3 text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
