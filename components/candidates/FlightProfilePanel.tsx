"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plane, Sparkles, Check, X, Loader, Clock } from "lucide-react";
import { clsx } from "clsx";

type Metric = {
  id: string;
  key: string;
  label: string;
  valueNumber: number | null;
  valueText: string | null;
  unit: string | null;
  status: string;
  sourceSnippet: string | null;
};

type FlightProfilePanelProps = {
  candidateId: string;
  metrics: Metric[];
  hasDocuments: boolean;
};

function metricValue(m: Metric) {
  if (m.valueNumber !== null && m.valueNumber !== undefined) {
    return m.valueNumber.toLocaleString();
  }
  return m.valueText ?? "—";
}

export function FlightProfilePanel({ candidateId, metrics, hasDocuments }: FlightProfilePanelProps) {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const confirmed = metrics.filter((m) => m.status === "CONFIRMED");
  const suggested = metrics.filter((m) => m.status === "SUGGESTED");

  async function scan() {
    setScanning(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/extract-metrics`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "Scan failed.");
      setMessage(data.message ?? "Scan complete.");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Scan failed.");
    } finally {
      setScanning(false);
    }
  }

  async function act(id: string, action: "accept" | "dismiss") {
    setBusyId(id);
    try {
      await fetch(`/api/candidate-metrics/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function acceptAll() {
    setBusyId("all");
    try {
      await Promise.all(
        suggested.map((m) =>
          fetch(`/api/candidate-metrics/${m.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "accept" })
          })
        )
      );
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-xl bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">
          <Plane className="h-3.5 w-3.5" /> Flight Profile
        </p>
        <button
          onClick={scan}
          disabled={scanning}
          className="flex items-center gap-1 rounded-lg border border-brand-lea/20 px-2.5 py-1 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/40 disabled:opacity-60"
          title="Scan this candidate's documents for flight data"
        >
          {scanning ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {scanning ? "Scanning…" : "Scan docs"}
        </button>
      </div>

      {message && <div className="mt-2 rounded bg-brand-cloudDancer/50 px-2 py-1 text-[11px] text-brand-grey">{message}</div>}

      {/* Confirmed values */}
      {confirmed.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {confirmed.map((m) => (
            <div key={m.id} className="rounded-lg bg-brand-cloudDancer/45 px-2.5 py-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-brand-grey">{m.label}</div>
              <div className="mt-0.5 text-sm font-semibold text-brand-lea">
                {metricValue(m)}
                {m.unit && m.valueNumber !== null ? <span className="ml-1 text-[10px] font-normal text-brand-grey">{m.unit}</span> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pending suggestions */}
      {suggested.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
              <Clock className="h-3 w-3" /> {suggested.length} to review
            </span>
            <button onClick={acceptAll} disabled={busyId === "all"} className="text-[11px] font-semibold text-brand-eden hover:underline disabled:opacity-60">
              {busyId === "all" ? "Accepting…" : "Accept all"}
            </button>
          </div>
          <div className="space-y-1.5">
            {suggested.map((m) => (
              <div key={m.id} className="rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-1.5">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] text-brand-grey">{m.label}</span>{" "}
                    <span className="text-sm font-semibold text-brand-lea">
                      {metricValue(m)}
                      {m.unit && m.valueNumber !== null ? <span className="ml-0.5 text-[10px] font-normal text-brand-grey">{m.unit}</span> : null}
                    </span>
                  </div>
                  <button onClick={() => act(m.id, "accept")} disabled={busyId === m.id} className="rounded p-1 text-emerald-700 hover:bg-emerald-100" aria-label="Accept">
                    {busyId === m.id ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => act(m.id, "dismiss")} disabled={busyId === m.id} className="rounded p-1 text-brand-grey hover:bg-brand-cloudDancer/50" aria-label="Dismiss">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {m.sourceSnippet && <div className="mt-0.5 truncate text-[10px] italic text-brand-grey/80" title={m.sourceSnippet}>“{m.sourceSnippet}”</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty states */}
      {confirmed.length === 0 && suggested.length === 0 && (
        <p className="mt-3 text-xs leading-5 text-brand-grey">
          {hasDocuments
            ? "No flight data yet — click “Scan docs” to pull Total Time, type ratings, and more from this candidate's documents."
            : "Add a resume or pilot app, then scan to extract flight hours and ratings."}
        </p>
      )}
    </section>
  );
}
