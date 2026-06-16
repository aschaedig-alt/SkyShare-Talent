"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { SlidersHorizontal, RefreshCw, Users, Radar } from "lucide-react";
import { scanRequirementMatches } from "@/app/pilot-requirements/scoring-actions";
import { MatchCard, formatScanTime } from "@/components/pilot-requirements/MatchCard";
import type { JobScreeningData } from "@/lib/data/job-screening";

export function JobScreeningPanel({ data }: { data: JobScreeningData }) {
  const [best, setBest] = useState(data.best);
  const [scan, setScan] = useState<{ count: number; at: string } | null>(null);
  const [scanning, startScan] = useTransition();
  const [scanError, setScanError] = useState<string | null>(null);

  const applicantIds = new Set(data.applicantIds);

  function runScan() {
    if (!data.requirementId) return;
    setScanError(null);
    startScan(async () => {
      const res = await scanRequirementMatches(data.requirementId!);
      if (res.ok && res.data) {
        setBest(res.data.matches);
        setScan({ count: res.data.scannedCount, at: res.data.scannedAt });
      } else {
        setScanError(res.error ?? "Could not scan candidates.");
      }
    });
  }

  return (
    <section className="flex h-full flex-col overflow-hidden rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Screening</p>
          <h3 className="text-base font-semibold text-brand-lea">Candidates by the numbers</h3>
          <p className="mt-1 text-xs text-brand-grey">
            Decision support for this job — not a ranking, no one is filtered out. Never uses age, name, gender or
            location.
          </p>
        </div>
        {data.hasRequirement ? (
          <Link
            href="/pilot-requirements/scoring"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-element border border-brand-lea/15 px-2.5 py-1.5 text-xs font-semibold text-brand-eden transition hover:border-brand-sweet hover:bg-brand-cloudDancer/60"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> Scoring setup
          </Link>
        ) : null}
      </div>

      {!data.hasRequirement ? (
        <div className="mt-4 rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-4 text-sm text-brand-grey">
          This job has no linked pilot requirement yet, so there are no aircraft, seat, or hour minimums to score
          against. Link a requirement profile (see Linked requirements) to enable screening.
        </div>
      ) : (
        <div className="mt-3 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-element bg-brand-cloudDancer/45 px-3 py-2">
            <div className="text-[11px] text-brand-grey">
              Scored against <span className="font-semibold text-brand-lea">{data.requirementTitle}</span> ·{" "}
              <span className="font-semibold text-brand-lea">{(scan?.count ?? data.scannedCount).toLocaleString()}</span>{" "}
              active candidates
              {scan ? <span> · scanned {formatScanTime(scan.at)}</span> : null}
            </div>
            <button
              type="button"
              onClick={runScan}
              disabled={scanning}
              className="inline-flex items-center gap-1.5 rounded-element bg-brand-lea px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${scanning ? "animate-spin" : ""}`} />
              {scanning ? "Scanning…" : "Scan candidates"}
            </button>
          </div>
          {scanError ? <p className="text-[11px] text-value-customerFocus-dark">{scanError}</p> : null}

          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-grey">
              <Users className="h-3.5 w-3.5" /> Applicants ({data.applicants.length})
            </div>
            {data.applicants.length > 0 ? (
              <div className="space-y-3">
                {data.applicants.map((match) => (
                  <MatchCard
                    key={`applicant:${match.candidateId}`}
                    match={match}
                    requirementId={data.requirementId}
                    canEdit={data.canEdit}
                    applied
                  />
                ))}
              </div>
            ) : (
              <p className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 text-sm text-brand-grey">
                No one has applied to this job yet.
              </p>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-grey">
              <Radar className="h-3.5 w-3.5" /> Best in the system ({best.length})
            </div>
            {best.length > 0 ? (
              <div className="space-y-3">
                {best.map((match) => (
                  <MatchCard
                    key={`best:${match.candidateId}`}
                    match={match}
                    requirementId={data.requirementId}
                    canEdit={data.canEdit}
                    applied={applicantIds.has(match.candidateId)}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 text-sm text-brand-grey">
                No strong matches found yet. Add candidate data, then scan again.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
