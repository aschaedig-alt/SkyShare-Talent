"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X, AlertTriangle } from "lucide-react";

/**
 * TEST-DATA teardown for a candidate. Only rendered when the viewer is an admin
 * AND the candidate carries the TEST tag (the server re-checks both). Requires
 * typing the exact name, and can also remove the onboarding record the candidate
 * produced — so a full start-to-finish test run resets in one action.
 */
export function DeleteCandidateButton({
  candidateId,
  candidateName,
  hasHire
}: {
  candidateId: string;
  candidateName: string;
  hasHire: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [alsoHire, setAlsoHire] = useState(hasHire);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = typed.trim() === candidateName.trim();

  async function remove() {
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName: typed.trim(), deleteHire: alsoHire })
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? "Could not delete this candidate.");
      }
      // Gone — back to the list.
      router.push("/candidates");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this candidate.");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => { setTyped(""); setAlsoHire(hasHire); setError(null); setOpen(true); }}
        className="inline-flex items-center gap-1.5 rounded border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
        title="Delete this test candidate"
      >
        <Trash2 className="h-4 w-4" /> Delete test
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-lea/40 p-4" onClick={() => !busy && setOpen(false)}>
          <div className="w-full max-w-md rounded bg-white p-5 shadow-xl dark:bg-brand-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-red-700 dark:text-red-300">
                <AlertTriangle className="h-5 w-5" /> Delete test candidate
              </h2>
              <button onClick={() => !busy && setOpen(false)} className="rounded p-1 text-brand-grey hover:text-brand-lea dark:text-slate-400" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-brand-grey dark:text-slate-400">
              This permanently removes <span className="font-semibold text-brand-lea dark:text-slate-100">{candidateName}</span> and all of their data
              (applications, offers, notes, interviews, documents). This cannot be undone.
            </p>

            {hasHire && (
              <label className="mt-3 flex items-start gap-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                <input type="checkbox" checked={alsoHire} onChange={(e) => setAlsoHire(e.target.checked)} className="mt-0.5" />
                <span>Also delete the onboarding record this candidate produced (recommended for a full test reset).</span>
              </label>
            )}

            <label className="mt-3 block">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">Type the name to confirm</span>
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={candidateName}
                className="mt-1 w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-black outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-400/20 dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
              />
            </label>

            {error && <p className="mt-2 text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} disabled={busy} className="rounded border border-brand-lea/20 px-4 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/40 disabled:opacity-50 dark:border-white/10 dark:text-slate-100">
                Cancel
              </button>
              <button
                onClick={remove}
                disabled={!confirmed || busy}
                className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-40"
              >
                {busy ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
