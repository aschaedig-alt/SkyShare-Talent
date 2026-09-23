"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Link2, Search, X } from "lucide-react";
import type { JobSuggestion } from "@/lib/jobs/paycom-title-match";

/**
 * Link an application to its job IN PLACE — the control her feedback asked for
 * (cmtynseh3, Sep 12): "i cant see how to link the actual job in its place. i
 * tried it and it just linked a second job." Link to a job at the top of the tab
 * makes a NEW application; this fills in the job on the one that is already there.
 *
 * The suggestions come from lib/jobs/paycom-title-match.ts. "Best match" is shown
 * only where the title names exactly one job; everything else is a choice, and
 * "Another job…" searches every job for the cases the matcher cannot see.
 *
 * If the person already has a row for that job that was made in the app — usually
 * the one holding the offer — the server says so instead of making a second row,
 * and this asks before combining the two (app/api/candidate-applications/[id]/job).
 */

type FoundJob = { id: string; title: string; status: string; baseLocation: string | null };

type Props = {
  applicationId: string;
  candidateId: string;
  suggestions: JobSuggestion[];
  canEdit: boolean;
};

type Pending = { jobId: string; jobTitle: string; offerStatus: string | null; source: string | null };

function statusWord(status: string): string {
  return status === "OPEN" ? "Open" : status === "RETIRED" ? "Inactive" : status.toLowerCase();
}

export function LinkApplicationJob({ applicationId, candidateId, suggestions, canEdit }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoundJob[] | null>(null);
  // Set when the server found a hand-made row for the same job and wants a yes.
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    if (!searching) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        // Retired jobs included: a past application usually belongs to one.
        const res = await fetch(`/api/recruiting-jobs?includeRetired=1&q=${encodeURIComponent(query)}`, { signal: ctrl.signal });
        if (res.ok) setResults(((await res.json()) as { jobs: FoundJob[] }).jobs.slice(0, 8));
      } catch {
        /* aborted by the next keystroke */
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, searching]);

  if (!canEdit) return null;

  async function link(jobId: string, jobTitle: string, combine = false) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidate-applications/${applicationId}/job`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, jobId, combine })
      });
      const data = (await res.json().catch(() => null)) as
        | { message?: string; needsCombine?: boolean; other?: { offerStatus?: string | null; source?: string | null }; jobTitle?: string }
        | null;
      if (res.status === 409 && data?.needsCombine) {
        setPending({ jobId, jobTitle: data.jobTitle ?? jobTitle, offerStatus: data.other?.offerStatus ?? null, source: data.other?.source ?? null });
        return;
      }
      if (!res.ok) throw new Error(data?.message ?? "Could not link that job.");
      setPending(null);
      setSearching(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not link that job.");
    } finally {
      setBusy(false);
    }
  }

  if (pending) {
    const holdsOffer = pending.offerStatus && pending.offerStatus !== "NONE";
    return (
      <div className="mt-2 rounded border border-brand-gold/50 bg-brand-gold/10 p-2.5 text-xs text-brand-lea dark:border-brand-gold/40 dark:text-slate-100">
        <p>
          This person already has another <b>{pending.jobTitle}</b> row
          {pending.source ? ` (${pending.source.length > 48 ? `${pending.source.slice(0, 48)}…` : pending.source})` : ""}
          {holdsOffer ? ", holding their offer" : ""}. Linking this application to the same job would leave two rows for
          one application.
        </p>
        <p className="mt-1 text-brand-grey dark:text-slate-400">
          Combine them into one row — this one, which keeps the Paycom date and wording
          {holdsOffer ? ", taking the offer across" : ""}.
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void link(pending.jobId, pending.jobTitle, true)}
            className="rounded bg-brand-lea px-3 py-1 font-semibold text-white transition hover:bg-brand-eden hover:shadow-glow disabled:opacity-60 dark:bg-brand-sweet dark:text-brand-lea"
          >
            {busy ? "Combining…" : "Combine into one row"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setPending(null)}
            className="rounded border border-brand-lea/20 px-3 py-1 font-semibold text-brand-eden transition hover:shadow-glow dark:border-white/10 dark:text-slate-200"
          >
            Cancel
          </button>
        </div>
        {error ? <p className="mt-1 font-medium text-red-700 dark:text-red-300">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="font-semibold text-brand-grey dark:text-slate-400">
          <Link2 className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
          Link to the job:
        </span>
        {suggestions.map((s) => (
          <button
            key={s.jobId}
            type="button"
            disabled={busy}
            onClick={() => void link(s.jobId, s.title)}
            title={
              s.confident
                ? "The only job with this title"
                : s.tier === "fleet"
                  ? "The same seat, under a different job title"
                  : "A similar title — check it is the right one"
            }
            className={clsx(
              "rounded border px-2 py-0.5 font-semibold transition hover:shadow-glow disabled:opacity-60",
              s.confident
                ? "border-brand-gold bg-brand-gold/15 text-brand-lea dark:text-slate-100"
                : "border-brand-lea/15 bg-white text-brand-eden dark:border-white/10 dark:bg-brand-panel dark:text-slate-200"
            )}
          >
            {s.title}
            <span className="ml-1 font-normal text-brand-grey dark:text-slate-400">
              · {statusWord(s.status)}
              {s.location ? ` · ${s.location}` : ""}
            </span>
            {s.confident ? <span className="ml-1 text-[10px] font-bold uppercase tracking-wide text-brand-gold">Best match</span> : null}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setSearching((v) => !v);
            setResults(null);
          }}
          className="rounded px-1.5 py-0.5 font-semibold text-brand-eden underline-offset-2 transition hover:underline dark:text-brand-edenOnDark"
        >
          {searching ? "Close search" : suggestions.length ? "Another job…" : "Find the job…"}
        </button>
      </div>

      {searching ? (
        <div className="mt-2 max-w-md rounded border border-brand-lea/15 bg-white p-2 dark:border-white/10 dark:bg-brand-panel">
          <label className="flex items-center gap-2 rounded border border-brand-lea/15 px-2 py-1 focus-within:border-brand-gold dark:border-white/10">
            <Search className="h-3.5 w-3.5 shrink-0 text-brand-grey" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search jobs by title"
              aria-label="Search jobs by title"
              className="min-w-0 flex-1 bg-transparent text-sm text-brand-lea outline-none dark:text-slate-100"
            />
            <button type="button" onClick={() => setSearching(false)} aria-label="Close search" className="text-brand-grey hover:text-brand-lea">
              <X className="h-3.5 w-3.5" />
            </button>
          </label>
          <div className="mt-1.5 space-y-0.5">
            {results === null ? (
              <p className="px-1 py-1 text-xs text-brand-grey dark:text-slate-400">Searching…</p>
            ) : results.length === 0 ? (
              <p className="px-1 py-1 text-xs text-brand-grey dark:text-slate-400">No job matches that.</p>
            ) : (
              results.map((j) => (
                <button
                  key={j.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void link(j.id, j.title)}
                  className="block w-full rounded px-2 py-1 text-left text-sm text-brand-lea transition hover:bg-brand-cloudDancer/60 hover:shadow-glow disabled:opacity-60 dark:text-slate-100 dark:hover:bg-white/5"
                >
                  {j.title}
                  <span className="ml-1 text-xs text-brand-grey dark:text-slate-400">
                    · {statusWord(j.status)}
                    {j.baseLocation ? ` · ${j.baseLocation}` : ""}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-1 text-xs font-medium text-red-700 dark:text-red-300">{error}</p> : null}
    </div>
  );
}

/**
 * Undo an in-place link on an application imported from Paycom — it goes back to
 * showing Paycom's title with the link options, nothing else changes. Two clicks,
 * like every other unlink on this tab.
 */
export function UnlinkApplicationJob({ applicationId, candidateId, canEdit }: { applicationId: string; candidateId: string; canEdit: boolean }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!canEdit) return null;
  async function unlink() {
    setBusy(true);
    const res = await fetch(`/api/candidate-applications/${applicationId}/job`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId, jobId: null })
    });
    setBusy(false);
    setArmed(false);
    if (res.ok) router.refresh();
  }
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => (armed ? void unlink() : setArmed(true))}
      onBlur={() => setArmed(false)}
      className={clsx(
        "rounded px-1.5 py-0.5 text-[11px] font-semibold transition disabled:opacity-60",
        armed ? "bg-red-600 text-white" : "text-brand-grey underline-offset-2 hover:text-brand-lea hover:underline dark:text-slate-400"
      )}
    >
      {armed ? "Click again to unlink" : "Unlink job"}
    </button>
  );
}
