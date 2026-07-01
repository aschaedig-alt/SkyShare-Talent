"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plane, Sparkles, Check, X, Loader, Clock, Pencil, Plus } from "lucide-react";

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
  const recencyMetric = metrics.find((m) => m.key === "recency_12mo");
  const [recencyDraft, setRecencyDraft] = useState(recencyMetric?.valueNumber != null ? String(recencyMetric.valueNumber) : "");
  const [savingRecency, setSavingRecency] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [addLabel, setAddLabel] = useState("");
  const [addValue, setAddValue] = useState("");

  async function addField() {
    if (!addLabel.trim() || !addValue.trim()) return;
    setBusyId("add");
    try {
      const res = await fetch(`/api/candidates/${candidateId}/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: addLabel, value: addValue })
      });
      if (res.ok) {
        setAddLabel("");
        setAddValue("");
        setAdding(false);
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(m: Metric) {
    setEditingId(m.id);
    setEditLabel(m.label);
    setEditVal(m.valueNumber !== null && m.valueNumber !== undefined ? String(m.valueNumber) : m.valueText ?? "");
  }

  async function saveEdit(m: Metric, accept: boolean) {
    const isNum = m.valueNumber !== null && m.valueNumber !== undefined;
    const body: Record<string, unknown> = isNum
      ? { valueNumber: Number(editVal.replace(/,/g, "")) || 0 }
      : { valueText: editVal.trim() };
    body.label = editLabel.trim() || m.label;
    if (accept) body.action = "accept";
    setBusyId(m.id);
    try {
      await fetch(`/api/candidate-metrics/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      setEditingId(null);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  const confirmed = metrics.filter((m) => m.status === "CONFIRMED" && m.key !== "recency_12mo");
  const suggested = metrics.filter((m) => m.status === "SUGGESTED");

  async function saveRecency() {
    const v = recencyDraft.trim();
    if (!/^[\d,]*$/.test(v)) return;
    setSavingRecency(true);
    try {
      await fetch(`/api/candidates/${candidateId}/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "recency_12mo", label: "Hours (last 12 mo)", value: v || "0", unit: "hrs" })
      });
      router.refresh();
    } finally {
      setSavingRecency(false);
    }
  }

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
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">
          <Plane className="h-3.5 w-3.5" /> Flight Profile
        </p>
        <button
          onClick={scan}
          disabled={scanning}
          className="flex items-center gap-1 rounded border border-brand-lea/20 px-2.5 py-1 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/40 disabled:opacity-60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5"
          title="Scan this candidate's documents for flight data"
        >
          {scanning ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {scanning ? "Scanning…" : "Scan docs"}
        </button>
      </div>

      {message && <div className="mt-2 rounded bg-brand-cloudDancer/50 px-2 py-1 text-[11px] text-brand-grey dark:bg-white/5 dark:text-slate-400">{message}</div>}

      {/* Currency — hours flown in the last 12 months; drives the Recency score */}
      <div className="mt-3 flex items-center gap-2 rounded bg-brand-cloudDancer/45 px-2.5 py-2 dark:bg-white/5">
        <Clock className="h-3.5 w-3.5 shrink-0 text-brand-eden" />
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-brand-grey dark:text-slate-400">Hours (last 12 mo)</span>
        <input
          type="text"
          inputMode="numeric"
          value={recencyDraft}
          onChange={(e) => setRecencyDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveRecency();
          }}
          placeholder="—"
          className="ml-auto w-16 rounded border border-brand-lea/20 px-1.5 py-0.5 text-right text-sm text-brand-lea focus:border-brand-gold focus:outline-none dark:border-white/10 dark:text-slate-100"
        />
        <button onClick={saveRecency} disabled={savingRecency} className="rounded p-0.5 text-emerald-700 disabled:opacity-50" aria-label="Save recent hours">
          {savingRecency ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Confirmed values */}
      {confirmed.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {confirmed.map((m) => (
            <div key={m.id} className="group rounded bg-brand-cloudDancer/45 px-2.5 py-2 dark:bg-white/5">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-brand-grey dark:text-slate-400">{m.label}</div>
                {editingId !== m.id && (
                  <button onClick={() => startEdit(m)} className="text-brand-grey opacity-0 transition group-hover:opacity-100 dark:text-slate-400" aria-label="Edit">
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </div>
              {editingId === m.id ? (
                <div className="mt-1 space-y-1">
                  <input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    placeholder="Label"
                    className="w-full rounded border border-brand-lea/30 px-1.5 py-0.5 text-xs font-semibold text-brand-lea focus:border-brand-gold focus:outline-none dark:border-white/10 dark:text-slate-100"
                  />
                  <div className="flex items-center gap-1">
                    <input
                      value={editVal}
                      onChange={(e) => setEditVal(e.target.value)}
                      autoFocus
                      placeholder="Value"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(m, false);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="min-w-0 flex-1 rounded border border-brand-lea/30 px-1.5 py-0.5 text-sm focus:border-brand-gold focus:outline-none dark:border-white/10"
                    />
                    <button onClick={() => saveEdit(m, false)} disabled={busyId === m.id} className="rounded p-0.5 text-emerald-700" aria-label="Save"><Check className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setEditingId(null)} className="rounded p-0.5 text-brand-grey dark:text-slate-400" aria-label="Cancel"><X className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ) : (
                <div className="mt-0.5 text-sm font-semibold text-brand-lea dark:text-slate-100">
                  {metricValue(m)}
                  {m.unit && m.valueNumber !== null ? <span className="ml-1 text-[10px] font-normal text-brand-grey dark:text-slate-400">{m.unit}</span> : null}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pending suggestions */}
      {suggested.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
              <Clock className="h-3 w-3" /> {suggested.length} to review
            </span>
            <button onClick={acceptAll} disabled={busyId === "all"} className="text-[11px] font-semibold text-brand-eden hover:underline disabled:opacity-60">
              {busyId === "all" ? "Accepting…" : "Accept all"}
            </button>
          </div>
          <div className="space-y-1.5">
            {suggested.map((m) => (
              <div key={m.id} className="rounded border border-amber-200 bg-amber-50/60 px-2.5 py-1.5">
                {editingId === m.id ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        placeholder="Label"
                        className="w-[42%] rounded border border-brand-lea/30 px-1.5 py-0.5 text-xs font-semibold text-brand-lea focus:border-brand-gold focus:outline-none dark:border-white/10 dark:text-slate-100"
                      />
                      <input
                        value={editVal}
                        onChange={(e) => setEditVal(e.target.value)}
                        autoFocus
                        placeholder="Value"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(m, true);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="min-w-0 flex-1 rounded border border-brand-lea/30 px-1.5 py-0.5 text-sm focus:border-brand-gold focus:outline-none dark:border-white/10"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => saveEdit(m, true)} disabled={busyId === m.id} className="flex items-center gap-1 rounded bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-emerald-700" aria-label="Save and accept">
                        {busyId === m.id ? <Loader className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save &amp; accept
                      </button>
                      <button onClick={() => setEditingId(null)} className="rounded border border-brand-lea/20 px-2 py-0.5 text-[11px] font-semibold text-brand-grey dark:border-white/10 dark:text-slate-400" aria-label="Cancel">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="text-[11px] text-brand-grey dark:text-slate-400">{m.label}</span>{" "}
                      <span className="text-sm font-semibold text-brand-lea dark:text-slate-100">
                        {metricValue(m)}
                        {m.unit && m.valueNumber !== null ? <span className="ml-0.5 text-[10px] font-normal text-brand-grey dark:text-slate-400">{m.unit}</span> : null}
                      </span>
                    </div>
                    <button onClick={() => startEdit(m)} disabled={busyId === m.id} className="rounded p-1 text-brand-grey hover:bg-brand-cloudDancer/50 dark:text-slate-400 dark:bg-white/5" aria-label="Edit before accepting" title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => act(m.id, "accept")} disabled={busyId === m.id} className="rounded p-1 text-emerald-700 hover:bg-emerald-100" aria-label="Accept">
                      {busyId === m.id ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={() => act(m.id, "dismiss")} disabled={busyId === m.id} className="rounded p-1 text-brand-grey hover:bg-brand-cloudDancer/50 dark:text-slate-400 dark:bg-white/5" aria-label="Dismiss">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {editingId !== m.id && m.sourceSnippet && (
                  <div className="mt-0.5 truncate text-[10px] italic text-brand-grey/80" title={m.sourceSnippet}>“{m.sourceSnippet}”</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty states */}
      {confirmed.length === 0 && suggested.length === 0 && (
        <p className="mt-3 text-xs leading-5 text-brand-grey dark:text-slate-400">
          {hasDocuments
            ? "No flight data yet — click “Scan docs” to pull Total Time, type ratings, and more from this candidate's documents."
            : "Add a resume or pilot app, then scan to extract flight hours and ratings."}
        </p>
      )}

      {/* Add a field manually */}
      <div className="mt-3 border-t border-brand-lea/10 pt-3 dark:border-white/10">
        {adding ? (
          <div className="space-y-1.5">
            <input
              value={addLabel}
              onChange={(e) => setAddLabel(e.target.value)}
              placeholder="Field name (e.g. Tailwheel)"
              className="w-full rounded border border-brand-lea/30 px-2 py-1 text-xs font-semibold text-brand-lea focus:border-brand-gold focus:outline-none dark:border-white/10 dark:text-slate-100"
            />
            <input
              value={addValue}
              onChange={(e) => setAddValue(e.target.value)}
              placeholder="Value (e.g. 250 for hours, or text)"
              onKeyDown={(e) => {
                if (e.key === "Enter") addField();
                if (e.key === "Escape") setAdding(false);
              }}
              className="w-full rounded border border-brand-lea/30 px-2 py-1 text-sm focus:border-brand-gold focus:outline-none dark:border-white/10"
            />
            <div className="flex items-center justify-end gap-1">
              <button onClick={addField} disabled={busyId === "add" || !addLabel.trim() || !addValue.trim()} className="flex items-center gap-1 rounded bg-brand-lea px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-eden disabled:opacity-50">
                {busyId === "add" ? <Loader className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Add
              </button>
              <button onClick={() => setAdding(false)} className="rounded border border-brand-lea/20 px-2.5 py-1 text-[11px] font-semibold text-brand-grey dark:border-white/10 dark:text-slate-400">Cancel</button>
            </div>
            <p className="text-[10px] text-brand-grey dark:text-slate-400">A number becomes an hours field; anything else is saved as text.</p>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs font-semibold text-brand-eden hover:underline">
            <Plus className="h-3.5 w-3.5" /> Add a field
          </button>
        )}
      </div>
    </section>
  );
}
