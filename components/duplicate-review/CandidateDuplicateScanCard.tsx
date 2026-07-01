"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

type ScanResult = {
  message?: string;
  scannedCandidates?: number;
  candidatePairsFound?: number;
  newReviewItems?: number;
  existingReviewItems?: number;
  durationMs?: number;
  bucketCounts?: {
    email: number;
    phone: number;
    name: number;
  };
};

function formatResult(result: ScanResult | null) {
  if (!result) {
    return null;
  }

  return [
    `${result.scannedCandidates ?? 0} candidates scanned`,
    `${result.candidatePairsFound ?? 0} possible pairs`,
    `${result.newReviewItems ?? 0} new review items`,
    `${result.durationMs ?? 0}ms`
  ].join(" - ");
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

  const summary = formatResult(result);

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

      {summary ? (
        <div
          role="status"
          aria-live="polite"
          className="mt-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
        >
          {summary}
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </div>
      ) : null}
    </section>
  );
}
