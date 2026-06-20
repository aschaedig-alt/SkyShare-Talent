"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { SlidersHorizontal, RefreshCw, Download, X } from "lucide-react";
import { scanRequirementMatches, exportMatchContacts, type MatchContactRow } from "@/app/pilot-requirements/scoring-actions";
import { MatchCard, formatScanTime } from "@/components/pilot-requirements/MatchCard";
import type { PilotRequirementCandidateMatch } from "@/lib/matching/pilot-requirement-matches";

type Props = {
  matches: PilotRequirementCandidateMatch[];
  requirementId: string | null;
  canEdit: boolean;
  scannedCount: number;
};

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function downloadCsv(rows: MatchContactRow[]) {
  const header = ["Name", "Email", "Phone", "Current title", "Matched job"];
  const body = rows.map((r) => [r.name, r.email, r.phone, r.currentTitle, r.matchedJob].map(csvCell).join(","));
  const csv = [header.map(csvCell).join(","), ...body].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `matched-candidates-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function CandidateTriagePanel({ matches: initialMatches, requirementId, canEdit, scannedCount }: Props) {
  const [matches, setMatches] = useState(initialMatches);
  const [scan, setScan] = useState<{ count: number; at: string } | null>(null);
  const [scanning, startScan] = useTransition();
  const [scanError, setScanError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  function runScan() {
    if (!requirementId) return;
    setScanError(null);
    startScan(async () => {
      const res = await scanRequirementMatches(requirementId);
      if (res.ok && res.data) {
        setMatches(res.data.matches);
        setScan({ count: res.data.scannedCount, at: res.data.scannedAt });
        setSelected(new Set());
      } else {
        setScanError(res.error ?? "Could not scan candidates.");
      }
    });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = matches.length > 0 && matches.every((m) => selected.has(m.candidateId));
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(matches.map((m) => m.candidateId)));
  }

  async function exportSelected() {
    setScanError(null);
    setExporting(true);
    try {
      const res = await exportMatchContacts({ candidateIds: [...selected], requirementId });
      if (res.ok && res.rows && res.rows.length > 0) {
        downloadCsv(res.rows);
      } else {
        setScanError(res.error ?? "Could not export contacts.");
      }
    } finally {
      setExporting(false);
    }
  }

  const pool = scan?.count ?? scannedCount;

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Candidate fit</p>
          <h3 className="text-base font-semibold text-brand-lea dark:text-slate-100">Who to screen first</h3>
          <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
            Decision support — not a ranking, no one is filtered out. Scores never use age, name, gender or location.
          </p>
        </div>
        <Link
          href="/pilot-requirements/scoring"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-element border border-brand-lea/15 px-2.5 py-1.5 text-xs font-semibold text-brand-eden transition hover:border-brand-sweet hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:bg-white/5"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" /> Scoring setup
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-element bg-brand-cloudDancer/45 px-3 py-2 dark:bg-white/5">
        <div className="text-[11px] text-brand-grey dark:text-slate-400">
          <span className="font-semibold text-brand-lea dark:text-slate-100">{matches.length}</span> shown ·{" "}
          <span className="font-semibold text-brand-lea dark:text-slate-100">{pool.toLocaleString()}</span> active candidates in system
          {scan ? <span> · scanned {formatScanTime(scan.at)}</span> : null}
        </div>
        <button
          type="button"
          onClick={runScan}
          disabled={scanning || !requirementId}
          className="inline-flex items-center gap-1.5 rounded-element bg-brand-lea px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${scanning ? "animate-spin" : ""}`} />
          {scanning ? "Scanning…" : "Scan candidates"}
        </button>
      </div>
      {scanError ? <p className="mt-1.5 text-[11px] text-value-customerFocus-dark">{scanError}</p> : null}

      {canEdit && matches.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-brand-grey dark:text-slate-400">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-3.5 w-3.5 accent-brand-eden" />
            Select all
          </label>
          {selected.size > 0 ? (
            <div className="ml-auto flex items-center gap-2 rounded-element border border-brand-gold/40 bg-brand-gold/10 px-2.5 py-1">
              <span className="text-[11px] font-semibold text-brand-lea dark:text-slate-100">{selected.size} selected</span>
              <button
                type="button"
                onClick={exportSelected}
                disabled={exporting}
                className="inline-flex items-center gap-1.5 rounded-element bg-brand-lea px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60"
              >
                <Download className="h-3 w-3" /> {exporting ? "Exporting…" : "Export CSV"}
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="rounded-element p-0.5 text-brand-grey transition hover:text-brand-lea dark:text-slate-400"
                aria-label="Clear selection"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {matches.length > 0 ? (
        <div className="mt-4 space-y-3">
          {matches.map((match) => (
            <div key={`${requirementId}:${match.candidateId}`} className="flex items-start gap-2">
              {canEdit ? (
                <input
                  type="checkbox"
                  checked={selected.has(match.candidateId)}
                  onChange={() => toggle(match.candidateId)}
                  aria-label={`Select ${match.candidateName}`}
                  className="mt-3 h-4 w-4 shrink-0 accent-brand-eden"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <MatchCard match={match} requirementId={requirementId} canEdit={canEdit} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-4 text-sm text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
          No candidate evidence is strong enough yet. Add resume text, notes, tags, or structured candidate hours to
          improve matching, then scan again.
        </div>
      )}
    </section>
  );
}
