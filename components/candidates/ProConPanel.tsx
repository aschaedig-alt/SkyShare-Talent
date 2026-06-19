"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown, Plus, X } from "lucide-react";

/**
 * Pros & cons — structured strengths/concerns tags a recruiter records on a
 * candidate. Saves optimistically via PATCH /api/candidates/[id].
 *
 * NOTE: a future compliance audit (CA FEHA, NYC Local Law 144) may require
 * disclaimers or access gating; see roadmap "Scoring transparency & compliance".
 */
export function ProConPanel({
  candidateId,
  initialPros,
  initialCons
}: {
  candidateId: string;
  initialPros: string[];
  initialCons: string[];
}) {
  const [pros, setPros] = useState<string[]>(initialPros);
  const [cons, setCons] = useState<string[]>(initialCons);
  const [newPro, setNewPro] = useState("");
  const [newCon, setNewCon] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function persist(nextPros: string[], nextCons: string[]) {
    const prevPros = pros;
    const prevCons = cons;
    setPros(nextPros);
    setCons(nextCons);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pros: nextPros, cons: nextCons })
      });
      if (!res.ok) throw new Error();
    } catch {
      setPros(prevPros);
      setCons(prevCons);
      setError("Couldn't save — try again.");
    } finally {
      setBusy(false);
    }
  }

  function addPro() {
    const v = newPro.trim();
    if (!v || pros.includes(v)) return;
    setNewPro("");
    persist([...pros, v], cons);
  }
  function addCon() {
    const v = newCon.trim();
    if (!v || cons.includes(v)) return;
    setNewCon("");
    persist(pros, [...cons, v]);
  }
  function removePro(p: string) {
    persist(pros.filter((x) => x !== p), cons);
  }
  function removeCon(c: string) {
    persist(pros, cons.filter((x) => x !== c));
  }

  return (
    <div className="rounded-xl bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Pros &amp; cons</p>
        {busy ? <span className="text-[10px] text-brand-grey">Saving…</span> : null}
      </div>

      {/* Pros */}
      <div className="mt-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
          <ThumbsUp className="h-3.5 w-3.5" /> Strengths
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {pros.length === 0 ? <span className="text-xs text-brand-grey">None yet</span> : null}
          {pros.map((p) => (
            <span key={p} className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
              {p}
              <button type="button" onClick={() => removePro(p)} aria-label={`Remove ${p}`} className="text-emerald-600/70 transition hover:text-emerald-900">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5">
          <input
            value={newPro}
            onChange={(e) => setNewPro(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addPro();
              }
            }}
            placeholder="Add a strength"
            className="min-w-0 flex-1 rounded-lg border border-brand-lea/20 px-2.5 py-1.5 text-sm outline-none transition focus:border-brand-gold"
          />
          <button type="button" onClick={addPro} disabled={!newPro.trim()} className="rounded-lg border border-emerald-200 px-2 py-1.5 text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Cons */}
      <div className="mt-4">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
          <ThumbsDown className="h-3.5 w-3.5" /> Concerns
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {cons.length === 0 ? <span className="text-xs text-brand-grey">None yet</span> : null}
          {cons.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
              {c}
              <button type="button" onClick={() => removeCon(c)} aria-label={`Remove ${c}`} className="text-amber-600/70 transition hover:text-amber-900">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5">
          <input
            value={newCon}
            onChange={(e) => setNewCon(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCon();
              }
            }}
            placeholder="Add a concern"
            className="min-w-0 flex-1 rounded-lg border border-brand-lea/20 px-2.5 py-1.5 text-sm outline-none transition focus:border-brand-gold"
          />
          <button type="button" onClick={addCon} disabled={!newCon.trim()} className="rounded-lg border border-amber-200 px-2 py-1.5 text-amber-700 transition hover:bg-amber-50 disabled:opacity-50">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error ? <p className="mt-2 text-xs font-medium text-red-700">{error}</p> : null}
    </div>
  );
}
