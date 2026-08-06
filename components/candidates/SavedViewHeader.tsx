"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * The bar above a saved view: what it is, and the link to send.
 *
 * The link is NOT public. Opening it still goes through the candidates module
 * access check, so a hiring manager needs an account and the candidates module
 * must not be hidden for their role. Said on screen rather than left to be
 * discovered when somebody's link 404s.
 */
export function SavedViewHeader({
  viewId,
  name,
  note,
  count,
  missingCount,
  createdByEmail,
  canEdit
}: {
  viewId: string;
  name: string;
  note: string | null;
  count: number;
  missingCount: number;
  createdByEmail: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  async function copyLink() {
    const url = `${window.location.origin}/candidates/compare?view=${viewId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; select-and-copy from the box below still works.
      window.prompt("Copy this link:", url);
    }
  }

  async function remove() {
    setBusy(true);
    const res = await fetch(`/api/candidate-views/${viewId}`, { method: "DELETE" });
    if (res.ok) router.push("/candidates/compare");
    else setBusy(false);
  }

  return (
    <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Saved view</p>
          <h2 className="mt-0.5 text-xl font-semibold text-brand-lea dark:text-slate-100">{name}</h2>
          {note && <p className="mt-1 max-w-2xl text-sm text-brand-grey dark:text-slate-400">{note}</p>}
          <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
            {count} candidate{count === 1 ? "" : "s"}
            {createdByEmail ? ` · saved by ${createdByEmail}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => void copyLink()}>
            {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Link2 className="h-4 w-4" /> Copy link</>}
          </Button>
          {canEdit &&
            (confirmingDelete ? (
              <>
                <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
                <Button onClick={() => void remove()} disabled={busy}>
                  {busy ? "Deleting…" : "Really delete"}
                </Button>
              </>
            ) : (
              <Button variant="secondary" onClick={() => setConfirmingDelete(true)}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            ))}
        </div>
      </div>

      {missingCount > 0 && (
        <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
          {missingCount} candidate{missingCount === 1 ? " was" : "s were"} saved into this view but can no longer be
          loaded — they were most likely deleted or merged. The rest are shown.
        </p>
      )}

      <p className="mt-3 text-[11px] text-brand-grey dark:text-slate-400">
        Anyone you send this link to needs a Journey account with access to Candidates — it is not a public page.
      </p>
    </section>
  );
}
