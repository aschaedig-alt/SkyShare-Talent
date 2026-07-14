"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, CheckCircle2, AlertTriangle, CircleSlash } from "lucide-react";
import type { CalendarData } from "@/lib/data/calendar";
import { formatRelativeDay, formatTime } from "@/lib/calendar/format";

interface GoogleSyncCardProps {
  sync: CalendarData["sync"];
}

export function GoogleSyncCard({ sync }: GoogleSyncCardProps) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{ type: string; text: string } | null>(null);

  async function handleSync() {
    setSyncing(true);
    setResult(null);
    try {
      const response = await fetch("/api/calendar/sync", { method: "POST" });
      const data = await response.json();
      if (response.ok && data.ok) {
        setResult({ type: "success", text: data.message ?? "Sync complete." });
        router.refresh();
      } else {
        setResult({ type: "error", text: data.message ?? "Sync failed." });
      }
    } catch {
      setResult({ type: "error", text: "Sync request failed." });
    } finally {
      setSyncing(false);
    }
  }

  const lastSynced = sync.lastSyncedAt
    ? `${formatRelativeDay(sync.lastSyncedAt)} at ${formatTime(sync.lastSyncedAt)}`
    : "Never";

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">Google Calendar</p>
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Two-way sync</h2>
        </div>
        {sync.configured ? (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-100 dark:bg-emerald-500/15 px-2 py-1 text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3" /> Connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-500/15 dark:text-slate-300">
            <CircleSlash className="h-3 w-3" /> Not configured
          </span>
        )}
      </div>

      {sync.configured ? (
        <>
          <div className="mt-3 space-y-1 text-xs text-brand-grey dark:text-slate-400">
            <div className="flex justify-between">
              <span>Last synced</span>
              <span className="font-medium text-brand-lea dark:text-slate-100">{lastSynced}</span>
            </div>
            <div className="flex justify-between">
              <span>Status</span>
              <span className="font-medium text-brand-lea dark:text-slate-100">{sync.lastSyncStatus ?? "—"}</span>
            </div>
          </div>

          {sync.lastSyncError && (
            <div className="mt-2 flex items-start gap-1 rounded border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 px-2 py-1.5 text-[11px] text-amber-800 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {sync.lastSyncError}
            </div>
          )}

          <button
            onClick={handleSync}
            disabled={syncing}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-lea/90 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync now"}
          </button>

          {result && (
            <div
              className={`mt-2 rounded px-2 py-1.5 text-[11px] ${
                result.type === "success"
                  ? "border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "border border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300"
              }`}
            >
              {result.text}
            </div>
          )}

          <p className="mt-2 text-[11px] text-brand-grey dark:text-slate-400">
            Changes you make in the app sync to Google instantly. Use “Sync now” to pull changes made in Google back in
            (also runs automatically once a day).
          </p>
        </>
      ) : (
        <div className="mt-3 rounded border border-brand-lea/10 bg-brand-cloudDancer/50 p-3 text-sm text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
          Google Calendar credentials haven&apos;t been added yet. Once configured, interviews will sync to the shared
          SkyShare calendar automatically.
        </div>
      )}
    </section>
  );
}
