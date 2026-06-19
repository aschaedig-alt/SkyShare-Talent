"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ImportResult = {
  message?: string;
  created?: number;
  updated?: number;
  skipped?: number;
  warnings?: number;
};

export function CandidateCsvImportCard() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    setError(null);

    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a candidate CSV file first.");
      return;
    }

    const body = new FormData();
    body.set("file", file);

    startTransition(async () => {
      try {
        const response = await fetch("/api/imports/candidates", {
          method: "POST",
          body
        });
        const payload = (await response.json()) as ImportResult;

        if (!response.ok) {
          throw new Error(payload.message ?? "Candidate import failed.");
        }

        setResult(payload);
        if (inputRef.current) {
          inputRef.current.value = "";
        }
        router.refresh();
      } catch (importError) {
        setError(importError instanceof Error ? importError.message : "Candidate import failed.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
      <div className="flex min-h-[190px] flex-col justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">
            Active import
          </p>
          <h2 className="mt-2 text-base font-semibold text-brand-lea dark:text-slate-100">Candidate CSV import</h2>
          <p className="mt-2 text-sm leading-6 text-brand-grey dark:text-slate-400">
            Import candidate records, preserve source rows, normalize names, and match existing candidates by exact email or phone.
          </p>
        </div>
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="w-full rounded border border-brand-lea/15 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-[#10243a]"
          />
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded bg-brand-lea px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Importing candidates..." : "Import candidate CSV"}
          </button>
          {isPending ? (
            <div
              role="status"
              aria-live="polite"
              className="rounded border border-brand-sweet/50 bg-brand-sweet/20 p-2 text-xs font-semibold text-brand-lea dark:text-slate-100"
            >
              Reading the file, normalizing candidate names, and checking exact phone/email matches.
            </div>
          ) : null}
          {result ? (
            <div role="status" aria-live="polite" className="rounded border border-emerald-200 bg-emerald-50 p-2 text-xs font-semibold text-emerald-800">
              {result.message} Created {result.created ?? 0}, updated {result.updated ?? 0}, skipped {result.skipped ?? 0}.
            </div>
          ) : null}
          {error ? (
            <div role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-xs font-semibold text-red-800">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </form>
  );
}
