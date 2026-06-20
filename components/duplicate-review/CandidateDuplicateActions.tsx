"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GitMerge, X, Loader, ArrowRight } from "lucide-react";
import { clsx } from "clsx";
import type { DuplicateCandidateBrief } from "@/lib/data/duplicate-review";

type CandidateDuplicateActionsProps = {
  itemId: string;
  primary: DuplicateCandidateBrief;
  secondary: DuplicateCandidateBrief;
};

function CandidateCard({
  candidate,
  keep,
  onKeep
}: {
  candidate: NonNullable<DuplicateCandidateBrief>;
  keep: boolean;
  onKeep: () => void;
}) {
  const { counts } = candidate;
  return (
    <button
      onClick={onKeep}
      className={clsx(
        "flex-1 rounded border-2 p-3 text-left transition hover:shadow-glow",
        keep ? "border-emerald-400 bg-emerald-50/60" : "border-brand-lea/10 bg-white hover:border-brand-lea/30 dark:border-white/10 dark:bg-[#10243a]"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-brand-lea dark:text-slate-100">{candidate.displayName}</span>
        {keep ? (
          <span className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Keep</span>
        ) : (
          <span className="rounded bg-brand-cloudDancer px-2 py-0.5 text-[10px] font-bold uppercase text-brand-grey dark:bg-white/5 dark:text-slate-400">Merge in</span>
        )}
      </div>
      <div className="mt-1 text-xs text-brand-grey dark:text-slate-400">{candidate.email ?? "No email"}</div>
      <div className="text-xs text-brand-grey dark:text-slate-400">{candidate.phone ?? "No phone"}</div>
      <div className="mt-2 text-[11px] text-brand-grey dark:text-slate-400">
        {counts.files} files · {counts.applications} apps · {counts.interviews} interviews · {counts.notes} notes
      </div>
      <Link
        href={`/candidates/${candidate.id}`}
        onClick={(e) => e.stopPropagation()}
        className="mt-2 inline-block text-[11px] font-semibold text-brand-eden hover:text-brand-lea transition hover:shadow-glow dark:text-slate-100"
      >
        Open profile
      </Link>
    </button>
  );
}

export function CandidateDuplicateActions({ itemId, primary, secondary }: CandidateDuplicateActionsProps) {
  const router = useRouter();
  const [keepId, setKeepId] = useState<string | null>(primary?.id ?? null);
  const [busy, setBusy] = useState<"merge" | "dismiss" | null>(null);
  const [confirmMerge, setConfirmMerge] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  if (!primary || !secondary) {
    // One side is missing (e.g. already merged) — only allow dismiss.
    return (
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={async () => {
            setBusy("dismiss");
            await fetch("/api/duplicate-review/candidates/resolve", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ itemId, action: "dismiss" })
            });
            router.refresh();
          }}
          disabled={busy !== null}
          className="rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-lea hover:bg-brand-cloudDancer/40 dark:border-white/10 dark:text-slate-100 dark:bg-white/5"
        >
          Dismiss
        </button>
      </div>
    );
  }

  const dropId = keepId === primary.id ? secondary.id : primary.id;

  async function doMerge() {
    setBusy("merge");
    setMessage(null);
    try {
      const res = await fetch("/api/duplicate-review/candidates/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, action: "merge", keepId, dropId })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.message ?? "Merge failed.");
      setMessage({ type: "success", text: data.message });
      setTimeout(() => router.refresh(), 1200);
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Merge failed." });
      setBusy(null);
    }
  }

  async function doDismiss() {
    setBusy("dismiss");
    try {
      await fetch("/api/duplicate-review/candidates/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, action: "dismiss" })
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const keepName = keepId === primary.id ? primary.displayName : secondary.displayName;
  const dropName = keepId === primary.id ? secondary.displayName : primary.displayName;

  return (
    <div className="mt-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-grey dark:text-slate-400">
        Pick the record to keep, then merge
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <CandidateCard candidate={primary} keep={keepId === primary.id} onKeep={() => setKeepId(primary.id)} />
        <CandidateCard candidate={secondary} keep={keepId === secondary.id} onKeep={() => setKeepId(secondary.id)} />
      </div>

      {message && (
        <div
          className={clsx(
            "mt-2 rounded px-3 py-2 text-xs",
            message.type === "success" ? "border border-emerald-300 bg-emerald-50 text-emerald-700" : "border border-red-300 bg-red-50 text-red-700"
          )}
        >
          {message.text}
        </div>
      )}

      {confirmMerge ? (
        <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs text-amber-900">
            Merge <span className="font-semibold">{dropName}</span> into <span className="font-semibold">{keepName}</span>? All of {dropName}&apos;s files, applications, interviews, and notes move to {keepName}, and {dropName} is archived.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={doMerge}
              disabled={busy !== null}
              className="flex items-center gap-1 rounded bg-brand-lea px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-eden disabled:opacity-60"
            >
              {busy === "merge" ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <GitMerge className="h-3.5 w-3.5" />}
              Confirm merge
            </button>
            <button onClick={() => setConfirmMerge(false)} disabled={busy !== null} className="rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-lea dark:border-white/10 dark:text-slate-100">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-brand-grey dark:text-slate-400">
            {dropName} <ArrowRight className="h-3 w-3" /> {keepName}
          </span>
          <button
            onClick={() => setConfirmMerge(true)}
            disabled={busy !== null || !keepId}
            className="ml-auto flex items-center gap-1 rounded bg-brand-gold px-3 py-1.5 text-xs font-semibold text-brand-black hover:bg-brand-gold/90 disabled:opacity-60 dark:text-slate-100"
          >
            <GitMerge className="h-3.5 w-3.5" /> Merge
          </button>
          <button
            onClick={doDismiss}
            disabled={busy !== null}
            className="flex items-center gap-1 rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-lea hover:bg-brand-cloudDancer/40 disabled:opacity-60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5"
          >
            {busy === "dismiss" ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Not a duplicate
          </button>
        </div>
      )}
    </div>
  );
}
