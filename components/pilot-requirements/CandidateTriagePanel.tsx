"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { SlidersHorizontal, RefreshCw } from "lucide-react";
import { scanRequirementMatches } from "@/app/pilot-requirements/scoring-actions";
import { MatchCard, formatScanTime } from "@/components/pilot-requirements/MatchCard";
import type { PilotRequirementCandidateMatch } from "@/lib/matching/pilot-requirement-matches";

type Props = {
  matches: PilotRequirementCandidateMatch[];
  requirementId: string | null;
  canEdit: boolean;
  scannedCount: number;
};

export function CandidateTriagePanel({ matches: initialMatches, requirementId, canEdit, scannedCount }: Props) {
  const [matches, setMatches] = useState(initialMatches);
  const [scan, setScan] = useState<{ count: number; at: string } | null>(null);
  const [scanning, startScan] = useTransition();
  const [scanError, setScanError] = useState<string | null>(null);

  function runScan() {
    if (!requirementId) return;
    setScanError(null);
    startScan(async () => {
      const res = await scanRequirementMatches(requirementId);
      if (res.ok && res.data) {
        setMatches(res.data.matches);
        setScan({ count: res.data.scannedCount, at: res.data.scannedAt });
      } else {
        setScanError(res.error ?? "Could not scan candidates.");
      }
    });
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

      {matches.length > 0 ? (
        <div className="mt-4 space-y-3">
          {matches.map((match) => (
            <MatchCard
              key={`${requirementId}:${match.candidateId}`}
              match={match}
              requirementId={requirementId}
              canEdit={canEdit}
            />
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
