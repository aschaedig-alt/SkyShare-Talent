"use client";

import { useEffect, useState } from "react";

// Pick the person a new hire reports to.
//
// A LINK is preferred over typing a name and address: the orientation emails cc
// the supervisor, and a linked record means that address is read live at send
// time instead of being a copy typed once and left to go stale. Free text stays
// as the fallback for a supervisor who isn't in the app yet.

export type SupervisorResult = {
  id: string;
  name: string;
  position: string | null;
  department: string | null;
  email: string | null;
};

export function SupervisorPicker({
  hireId,
  linkedId,
  linkedName,
  linkedEmail,
  onLink,
  onUnlink
}: {
  /** The hire being edited — excluded from results so nobody supervises themselves. */
  hireId: string;
  linkedId: string | null;
  linkedName: string | null;
  linkedEmail: string | null;
  onLink: (person: SupervisorResult) => void;
  onUnlink: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SupervisorResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (q.trim().length < 2) {
      setResults([]);
      setFailed(false);
      return;
    }
    // `cancelled` is the in-flight guard. Without it, only the TIMER was
    // cancelled between keystrokes, never the request already in the air: a slow
    // response for "smi" could land after a fast one for "smith" and repaint the
    // wrong people under the query the user is actually looking at. Every
    // keystroke replaces this effect, and its cleanup retires the older request's
    // results rather than racing them.
    let cancelled = false;
    // Set before the timer — the 250ms debounce is time spent searching, and
    // saying otherwise renders "No match" over a search that hasn't run.
    setSearching(true);
    setFailed(false);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/new-hires/supervisor-search?q=${encodeURIComponent(q.trim())}&exclude=${encodeURIComponent(hireId)}`
        );
        if (!res.ok) throw new Error("supervisor search failed");
        const data = (await res.json()) as { people?: SupervisorResult[] };
        if (!cancelled) setResults(data.people ?? []);
      } catch {
        // A failed request is not "nobody by that name" — say which it was.
        if (!cancelled) {
          setResults([]);
          setFailed(true);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, open, hireId]);

  if (linkedId) {
    return (
      <div className="rounded border border-emerald-200 bg-emerald-50/60 px-3 py-2 dark:border-emerald-500/30 dark:bg-emerald-500/10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-brand-lea dark:text-slate-100">{linkedName ?? "Linked supervisor"}</div>
            <div className="truncate text-[11px] text-brand-grey dark:text-slate-400">
              {linkedEmail ? `${linkedEmail} · read from their record` : "No email on their record — the cc will be skipped"}
            </div>
          </div>
          <button type="button" onClick={onUnlink} className="rounded border border-brand-lea/20 px-2 py-1 text-[11px] font-semibold text-brand-lea transition hover:bg-white dark:border-white/10 dark:text-slate-100">
            Unlink
          </button>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
      >
        Link a supervisor
      </button>
    );
  }

  return (
    <div className="rounded border border-brand-lea/15 p-2 dark:border-white/10">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search people by name or email…"
        className="w-full rounded border border-brand-lea/15 px-2 py-1.5 text-sm dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100 dark:placeholder:text-slate-500"
      />
      <div className="mt-1 max-h-48 overflow-y-auto">
        {searching ? (
          <p className="px-1 py-2 text-[11px] text-brand-grey dark:text-slate-400">Searching…</p>
        ) : q.trim().length < 2 ? (
          <p className="px-1 py-2 text-[11px] text-brand-grey dark:text-slate-400">Type at least two characters.</p>
        ) : failed ? (
          <p className="px-1 py-2 text-[11px] text-brand-grey dark:text-slate-400">
            Couldn&apos;t run the search just now. Edit the name to try again.
          </p>
        ) : results.length === 0 ? (
          <p className="px-1 py-2 text-[11px] text-brand-grey dark:text-slate-400">
            No match. If they aren&apos;t in the app yet, type their name and email in the fields below instead.
          </p>
        ) : (
          results.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onLink(p);
                setOpen(false);
                setQ("");
              }}
              className="block w-full rounded px-2 py-1.5 text-left transition hover:bg-brand-cloudDancer/60 dark:hover:bg-white/5"
            >
              <span className="block text-sm text-brand-lea dark:text-slate-100">{p.name}</span>
              <span className="block text-[11px] text-brand-grey dark:text-slate-400">
                {[p.position, p.email ?? "no email on file"].filter(Boolean).join(" · ")}
              </span>
            </button>
          ))
        )}
      </div>
      <button type="button" onClick={() => setOpen(false)} className="mt-1 text-[11px] font-semibold text-brand-grey hover:text-brand-lea dark:text-slate-400">
        Cancel
      </button>
    </div>
  );
}
