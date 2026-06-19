"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X, Search, Plus } from "lucide-react";

type Found = { id: string; displayName: string; currentTitle: string | null; stage: string | null; primaryEmail: string | null };

const FIELD = "w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-black outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 dark:border-white/10 dark:bg-[#10243a] dark:text-slate-100";

export function AddCandidateToJob({ jobId, jobTitle }: { jobId: string; jobTitle: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", currentTitle: "" });

  useEffect(() => {
    if (!open || mode !== "existing") return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/candidates?q=${encodeURIComponent(query)}`, { signal: ctrl.signal });
        if (res.ok) {
          const body = (await res.json()) as { candidates: Found[] };
          setResults(body.candidates);
        }
      } catch {
        /* aborted */
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [open, mode, query]);

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function linkExisting(candidateId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/candidate-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, jobId })
      });
      if (res.ok) {
        finish();
      } else {
        setError("Could not link candidate.");
      }
    } catch {
      setError("Could not link candidate.");
    } finally {
      setBusy(false);
    }
  }

  async function createAndLink() {
    if (!form.firstName.trim() && !form.lastName.trim()) {
      setError("Enter at least a first or last name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, jobId })
      });
      if (res.ok) {
        finish();
      } else {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? "Could not create candidate.");
      }
    } catch {
      setError("Could not create candidate.");
    } finally {
      setBusy(false);
    }
  }

  function finish() {
    setOpen(false);
    setQuery("");
    setResults([]);
    setForm({ firstName: "", lastName: "", email: "", phone: "", currentTitle: "" });
    setMode("existing");
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded border border-brand-lea/20 px-2.5 py-1 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5"
      >
        <UserPlus className="h-3.5 w-3.5" /> Add candidate
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-lea/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl dark:bg-[#10243a]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">Add candidate</h2>
              <button onClick={() => setOpen(false)} className="rounded p-1 text-brand-grey hover:text-brand-lea dark:text-slate-400 dark:text-slate-100" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <p className="mb-3 text-xs text-brand-grey dark:text-slate-400">Linking to <span className="font-semibold text-brand-lea dark:text-slate-100">{jobTitle}</span></p>

            <div className="mb-3 inline-flex overflow-hidden rounded border border-brand-lea/20 text-xs font-semibold dark:border-white/10">
              <button onClick={() => setMode("existing")} className={`px-3 py-1.5 transition hover:shadow-glow ${mode === "existing" ? "bg-brand-lea text-white" : "text-brand-lea hover:bg-brand-cloudDancer/60 dark:text-slate-100 dark:bg-white/5"}`}>Existing candidate</button>
              <button onClick={() => setMode("new")} className={`px-3 py-1.5 transition hover:shadow-glow ${mode === "new" ? "bg-brand-lea text-white" : "text-brand-lea hover:bg-brand-cloudDancer/60 dark:text-slate-100 dark:bg-white/5"}`}>New candidate</button>
            </div>

            {mode === "existing" ? (
              <div>
                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-grey dark:text-slate-400" />
                  <input className={`${FIELD} pl-9`} placeholder="Search candidates by name or email" value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                <div className="max-h-64 space-y-1.5 overflow-y-auto">
                  {results.length > 0 ? (
                    results.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => linkExisting(c.id)}
                        disabled={busy}
                        className="flex w-full items-center justify-between gap-2 rounded border border-brand-lea/10 bg-brand-cloudDancer/40 px-3 py-2 text-left transition hover:border-brand-sweet hover:bg-brand-sweet/15 hover:shadow-glow disabled:opacity-60 dark:border-white/10 dark:bg-white/5"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-brand-lea dark:text-slate-100">{c.displayName}</span>
                          <span className="block truncate text-xs text-brand-grey dark:text-slate-400">{[c.currentTitle, c.primaryEmail].filter(Boolean).join(" · ") || "No details"}</span>
                        </span>
                        <Plus className="h-4 w-4 shrink-0 text-brand-eden" />
                      </button>
                    ))
                  ) : (
                    <p className="px-1 py-3 text-xs text-brand-grey dark:text-slate-400">No matches. Try a different search, or add a new candidate.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input className={FIELD} placeholder="First name" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
                  <input className={FIELD} placeholder="Last name" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
                </div>
                <input className={FIELD} placeholder="Email" value={form.email} onChange={(e) => set("email", e.target.value)} />
                <input className={FIELD} placeholder="Phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
                <input className={FIELD} placeholder="Current title (optional)" value={form.currentTitle} onChange={(e) => set("currentTitle", e.target.value)} />
                <button onClick={createAndLink} disabled={busy} className="w-full rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60">
                  {busy ? "Saving…" : "Create & link to job"}
                </button>
              </div>
            )}

            {error && <p className="mt-3 text-xs font-semibold text-red-600">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
