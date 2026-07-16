"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { History } from "lucide-react";
import type { CandidateProfileData } from "@/lib/data/candidates";

type LinkedHistoricalPanelProps = {
  // The current (new) candidate's id — the profile we keep when merging.
  keepId: string;
  link: NonNullable<CandidateProfileData["linkedHistorical"]>;
  canEdit: boolean;
};

// Surfaces a separate historical (Jazz) profile that appears to be the same
// person as the current candidate, with actions to view it, merge it in
// (old → new, soft-archiving the old), or dismiss the match. Reuses the
// existing /api/duplicate-review/candidates/resolve endpoint.
export function LinkedHistoricalPanel({ keepId, link, canEdit }: LinkedHistoricalPanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<"merge" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolve = async (action: "merge" | "dismiss") => {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/duplicate-review/candidates/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: link.reviewItemId,
          action,
          ...(action === "merge" ? { keepId, dropId: link.candidateId } : {})
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Action failed.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
      setBusy(null);
    }
  };

  const parts = [
    `${link.applicationCount} application${link.applicationCount === 1 ? "" : "s"}`,
    `${link.interviewCount} interview${link.interviewCount === 1 ? "" : "s"}`,
    `${link.fileCount} document${link.fileCount === 1 ? "" : "s"}`
  ].join(" · ");

  return (
    <section className="rounded border border-brand-gold/40 bg-brand-sweet/12 p-4 shadow-panel ring-1 ring-brand-gold/20 dark:bg-brand-gold/10 dark:ring-brand-gold/20">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gold/25 text-brand-lea dark:text-slate-100">
          <History className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Historical JazzHR record found</p>
          <p className="mt-1 text-sm text-brand-lea dark:text-slate-100">
            <span className="font-semibold">{link.displayName}</span>
            {" appears to be the same person — "}
            {parts}
            {" in the archive."}
          </p>
          <p className="mt-0.5 text-[11px] text-brand-grey dark:text-slate-400">
            Matched on {link.reason.replace(/-/g, " ")} ({link.confidence.toLowerCase()} confidence).
          </p>
          {error && <p className="mt-2 text-xs text-red-600 dark:text-red-300">{error}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href={`/candidates/${link.candidateId}`}
              className="rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-eden transition hover:bg-brand-cloudDancer/40 dark:border-white/10 dark:text-slate-200"
            >
              View historical record
            </Link>
            {canEdit && (
              <>
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        `Merge the historical record for "${link.displayName}" into this profile? ` +
                          `All archived applications, interviews, notes, and documents move here, and the old ` +
                          `record is archived (recoverable).`
                      )
                    ) {
                      void resolve("merge");
                    }
                  }}
                  disabled={busy !== null}
                  className="rounded bg-brand-gold px-3 py-1.5 text-xs font-semibold text-brand-black transition hover:bg-brand-gold/90 disabled:opacity-50 dark:text-slate-100"
                >
                  {busy === "merge" ? "Merging…" : "Merge into this profile"}
                </button>
                <button
                  onClick={() => void resolve("dismiss")}
                  disabled={busy !== null}
                  className="rounded px-3 py-1.5 text-xs font-semibold text-brand-grey transition hover:bg-brand-cloudDancer/40 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-white/5"
                >
                  {busy === "dismiss" ? "Dismissing…" : "Not a match"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
