"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

type ScanResult = {
  message?: string;
  scannedCandidates?: number;
  candidatePairsFound?: number;
  newReviewItems?: number;
  /** Of the pairs this run detected, how many already had a review item. */
  alreadyReviewedPairs?: number;
  existingReviewItems?: number;
  /** Open pairs closed because a side had already been merged away. */
  staleResolved?: number;
  durationMs?: number;
  bucketCounts?: {
    email: number;
    phone: number;
    name: number;
  };
};

/** Anchor on the "Already reviewed" panel further down the same page. */
export const CLOSED_PAIRS_ANCHOR = "already-reviewed-pairs";

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

export function CandidateDuplicateScanCard() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "scanning" | "success" | "error">("idle");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runScan() {
    setStatus("scanning");
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/duplicate-review/candidates/scan", {
        method: "POST"
      });
      const payload = (await response.json()) as ScanResult & { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Unable to scan candidate duplicates.");
      }

      setResult(payload);
      setStatus("success");
      router.refresh();
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Unable to scan candidate duplicates.");
      setStatus("error");
    }
  }

  // Split "detected" from "actionable" explicitly.
  //
  // The old banner said "N possible pairs" straight from candidatePairsFound,
  // which is EVERY pair the run detected regardless of whether somebody had
  // already dealt with it. The queue and all four stat tiles filter to OPEN, so
  // the page showed three numbers that contradicted each other: banner N,
  // tiles 0, closed-pairs panel 44. Aimee read the banner and reasonably asked
  // where the three pairs were. Detected = new + already reviewed, and only the
  // "new" half lands in the queue above.
  const detected = result?.candidatePairsFound ?? 0;
  const created = result?.newReviewItems ?? 0;
  const alreadyReviewed = result?.alreadyReviewedPairs ?? Math.max(detected - created, 0);

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">
            Candidate duplicate scan
          </p>
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Find likely duplicate candidate records</h2>
          <p className="mt-1 max-w-3xl text-xs text-brand-grey dark:text-slate-400">
            Uses indexed email, phone, and normalized-name buckets so large candidate lists do not need a full
            candidate-by-candidate comparison.
          </p>
        </div>
        <Button
          onClick={runScan}
          disabled={status === "scanning"}
          className="shadow-sm disabled:cursor-wait"
        >
          {status === "scanning" ? "Scanning..." : "Scan candidate duplicates"}
        </Button>
      </div>

      {status === "scanning" ? (
        <div
          role="status"
          aria-live="polite"
          className="mt-3 rounded border border-brand-sweet/40 bg-brand-cloudDancer/60 px-3 py-2 text-sm text-brand-lea dark:bg-white/5 dark:text-slate-100"
        >
          Scanning candidate buckets now. The review queue will refresh when it finishes.
        </div>
      ) : null}

      {result ? (
        <div
          role="status"
          aria-live="polite"
          className="mt-3 rounded border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-300"
        >
          <p className="font-semibold">
            {detected} {plural(detected, "pair", "pairs")} detected — {created} new,{" "}
            {alreadyReviewed} already reviewed
          </p>
          <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300/80">
            {created > 0
              ? `The ${created} new ${plural(created, "pair is", "pairs are")} in the review queue below. `
              : "Nothing new to review — every pair found was already merged or dismissed. "}
            {alreadyReviewed > 0 ? (
              <a
                href={`#${CLOSED_PAIRS_ANCHOR}`}
                className="font-semibold underline underline-offset-2 transition hover:text-emerald-950 dark:hover:text-emerald-200"
              >
                See the {alreadyReviewed} already reviewed
              </a>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-300/70">
            {result.scannedCandidates ?? 0} candidates scanned in {result.durationMs ?? 0}ms
            {result.staleResolved
              ? ` — ${result.staleResolved} stale ${plural(result.staleResolved, "pair", "pairs")} closed (a side was already merged)`
              : ""}
          </p>
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="mt-3 rounded border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15 px-3 py-2 text-sm text-red-900 dark:text-red-300">
          {error}
        </div>
      ) : null}
    </section>
  );
}
