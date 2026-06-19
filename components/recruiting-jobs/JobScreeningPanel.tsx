"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { SlidersHorizontal, RefreshCw, ChevronDown, Lightbulb } from "lucide-react";
import Link from "next/link";
import {
  scanRequirementMatches,
  setCandidateTier,
  setCandidateScanExclusion,
  getCandidatePreview,
  type CandidatePreview as CandidatePreviewData
} from "@/app/pilot-requirements/scoring-actions";
import { MatchCard, formatScanTime, readinessStyles } from "@/components/pilot-requirements/MatchCard";
import { CandidatePreview } from "@/components/recruiting-jobs/CandidatePreview";
import { SCAN_EXCLUSION_LABELS, type ScanExclusionReason } from "@/lib/candidates/scan-exclusion";
import type { JobScreeningData } from "@/lib/data/job-screening";
import type { PilotRequirementCandidateMatch, ReadinessLabel } from "@/lib/matching/pilot-requirement-matches";

const TIER_ORDER: ReadinessLabel[] = ["Strong signal", "Worth a look", "Needs review"];

type Tab = "all" | ReadinessLabel;

export function JobScreeningPanel({
  data,
  onViewCandidate
}: {
  data: JobScreeningData;
  onViewCandidate?: (candidateId: string) => void;
}) {
  const router = useRouter();
  const [best, setBest] = useState(data.best);
  const [scan, setScan] = useState<{ count: number; at: string } | null>(null);
  const [scanning, startScan] = useTransition();
  const [moving, startMove] = useTransition();
  const [scanError, setScanError] = useState<string | null>(null);
  const [learn, setLearn] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, ReadinessLabel>>({});
  const [exclusions, setExclusions] = useState<Record<string, ScanExclusionReason | null>>({});
  const [includeExcluded, setIncludeExcluded] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<CandidatePreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const appliedIds = useMemo(() => new Set(data.applicantIds), [data.applicantIds]);

  // One deduped list (applicants are kept in full; system matches fill in the rest),
  // with any in-session move + scan-exclusion layered on top of the server data.
  // Excluded candidates are hidden unless "Include excluded" is on.
  const merged = useMemo(() => {
    const byId = new Map<string, PilotRequirementCandidateMatch>();
    for (const match of data.applicants) byId.set(match.candidateId, match);
    for (const match of best) if (!byId.has(match.candidateId)) byId.set(match.candidateId, match);
    return [...byId.values()]
      .map((match) => {
        const moved = overrides[match.candidateId];
        const excludedReason =
          match.candidateId in exclusions ? exclusions[match.candidateId] : match.excludedReason;
        return {
          ...match,
          readiness: moved ?? match.readiness,
          overridden: moved ? true : match.overridden,
          excludedReason
        };
      })
      .filter((match) => includeExcluded || !match.excludedReason);
  }, [data.applicants, best, overrides, exclusions, includeExcluded]);

  const grouped = useMemo(() => {
    const groups: Record<ReadinessLabel, PilotRequirementCandidateMatch[]> = {
      "Strong signal": [],
      "Worth a look": [],
      "Needs review": []
    };
    for (const match of merged) groups[match.readiness].push(match);
    for (const tier of TIER_ORDER) {
      groups[tier].sort((a, b) => b.score - a.score || a.candidateName.localeCompare(b.candidateName));
    }
    return groups;
  }, [merged]);

  function rescan(include: boolean) {
    if (!data.requirementId) return;
    setScanError(null);
    startScan(async () => {
      const res = await scanRequirementMatches(data.requirementId!, include);
      if (res.ok && res.data) {
        setBest(res.data.matches);
        setScan({ count: res.data.scannedCount, at: res.data.scannedAt });
      } else {
        setScanError(res.error ?? "Could not scan candidates.");
      }
    });
  }

  function toggleIncludeExcluded() {
    const next = !includeExcluded;
    setIncludeExcluded(next);
    rescan(next);
  }

  function excludeCandidate(candidateId: string, candidateName: string, reason: ScanExclusionReason | null, note: string) {
    setExclusions((current) => ({ ...current, [candidateId]: reason }));
    setLearn(
      reason
        ? `Ignoring ${candidateName} in scans — ${SCAN_EXCLUSION_LABELS[reason]}. They won't appear in new scans unless “Include excluded” is on.`
        : `${candidateName} is back in the scan pool.`
    );
    startMove(async () => {
      const res = await setCandidateScanExclusion({ candidateId, reason, note });
      if (res.ok) {
        router.refresh();
      } else {
        setExclusions((current) => {
          const next = { ...current };
          delete next[candidateId];
          return next;
        });
        setLearn(res.error ?? "Could not update candidate.");
      }
    });
  }

  function moveTo(candidateId: string, candidateName: string, tier: ReadinessLabel) {
    if (!data.requirementId) return;
    setOverrides((current) => ({ ...current, [candidateId]: tier }));
    setLearn(`Moved ${candidateName} to “${tier}.” Saved — the system keeps them here and uses your call to learn.`);
    startMove(async () => {
      const res = await setCandidateTier({ requirementId: data.requirementId!, candidateId, tier });
      if (res.ok) {
        router.refresh();
      } else {
        setOverrides((current) => {
          const next = { ...current };
          delete next[candidateId];
          return next;
        });
        setLearn(res.error ?? "Could not move candidate.");
      }
    });
  }

  function toggle(tier: ReadinessLabel) {
    setCollapsed((current) => ({ ...current, [tier]: !current[tier] }));
  }

  function selectCandidate(candidateId: string) {
    if (selectedId === candidateId) {
      setSelectedId(null);
      setPreview(null);
      return;
    }
    setSelectedId(candidateId);
    setPreview(null);
    setPreviewLoading(true);
    getCandidatePreview(candidateId)
      .then((res) => {
        setPreviewLoading(false);
        if (res.ok && res.data) setPreview(res.data);
      })
      .catch(() => setPreviewLoading(false));
  }

  const selectedMatch = selectedId ? merged.find((match) => match.candidateId === selectedId) : undefined;

  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: "all", label: "All", count: merged.length },
    ...TIER_ORDER.map((tier) => ({ key: tier, label: tier, count: grouped[tier].length }))
  ];

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
        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-element bg-brand-cloudDancer/45 px-3 py-2">
            <div className="text-[11px] text-brand-grey">
              Scored against <span className="font-semibold text-brand-lea">{data.requirementTitle}</span> ·{" "}
              <span className="font-semibold text-brand-lea">{(scan?.count ?? data.scannedCount).toLocaleString()}</span>{" "}
              active candidates
              {scan ? <span> · scanned {formatScanTime(scan.at)}</span> : null}
            </div>
            <div className="flex items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-brand-grey">
                <input
                  type="checkbox"
                  checked={includeExcluded}
                  onChange={toggleIncludeExcluded}
                  disabled={scanning}
                  className="h-3.5 w-3.5 accent-brand-lea"
                />
                Include excluded
              </label>
              <button
                type="button"
                onClick={() => rescan(includeExcluded)}
                disabled={scanning}
                className="inline-flex items-center gap-1.5 rounded-element bg-brand-lea px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${scanning ? "animate-spin" : ""}`} />
                {scanning ? "Scanning…" : "Scan candidates"}
              </button>
            </div>
          </div>
          {scanError ? <p className="mt-2 text-[11px] text-value-customerFocus-dark">{scanError}</p> : null}

          <div className="mt-3 flex flex-wrap gap-1.5">
            {tabs.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => setTab(entry.key)}
                className={clsx(
                  "inline-flex items-center gap-1 rounded border px-2.5 py-1 text-[11px] font-semibold transition",
                  tab === entry.key
                    ? "border-brand-gold bg-brand-sweet/20 text-brand-lea"
                    : "border-brand-lea/15 text-brand-grey hover:border-brand-sweet hover:bg-brand-cloudDancer/55"
                )}
              >
                {entry.label} <span className="opacity-70">{entry.count}</span>
              </button>
            ))}
          </div>

          {data.canEdit ? (
            <p className="mt-2 text-[11px] text-brand-grey">
              Click a name to preview the candidate on the right. Disagree with a read? Use “Move to” — the move
              sticks and the system learns. To keep someone out of scans (test record, hired, didn’t pass, not a
              culture fit), set “Scan eligibility” on their card to ignore them.
            </p>
          ) : null}

          {learn ? (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-element bg-value-leadership-light px-2.5 py-1.5 text-[11px] font-medium text-value-leadership-dark">
              <Lightbulb className="h-3.5 w-3.5 shrink-0" /> {learn}
            </p>
          ) : null}

          <div className="mt-3 flex min-h-0 flex-1 gap-3">
          <div className={clsx("min-h-0 space-y-2 overflow-y-auto pr-1", selectedId ? "w-1/2 shrink-0" : "w-full flex-1")}>
            {TIER_ORDER.map((tier) => {
              if (tab !== "all" && tab !== tier) return null;
              const list = grouped[tier];
              const isCollapsed = !!collapsed[tier];
              return (
                <div key={tier} className="overflow-hidden rounded border border-brand-lea/10">
                  <button
                    type="button"
                    onClick={() => toggle(tier)}
                    aria-expanded={!isCollapsed}
                    className="flex w-full items-center justify-between gap-2 bg-brand-cloudDancer/35 px-3 py-2 text-left transition hover:bg-brand-cloudDancer/60"
                  >
                    <span className="flex items-center gap-2">
                      <span className={clsx("rounded px-2.5 py-0.5 text-[11px] font-semibold", readinessStyles[tier])}>
                        {tier}
                      </span>
                      <span className="text-xs text-brand-grey">({list.length})</span>
                    </span>
                    <ChevronDown
                      className={clsx("h-4 w-4 text-brand-grey transition-transform", isCollapsed && "-rotate-90")}
                    />
                  </button>
                  {!isCollapsed ? (
                    <div className="space-y-3 p-3">
                      {list.length > 0 ? (
                        list.map((match) => (
                          <MatchCard
                            key={`${tier}:${match.candidateId}`}
                            match={match}
                            requirementId={data.requirementId}
                            canEdit={data.canEdit}
                            applied={appliedIds.has(match.candidateId)}
                            onMoveTier={(next) => moveTo(match.candidateId, match.candidateName, next)}
                            moving={moving}
                            onExclude={(reason, note) => excludeCandidate(match.candidateId, match.candidateName, reason, note)}
                            excluding={moving}
                            onSelectName={selectCandidate}
                            selected={selectedId === match.candidateId}
                            onViewRoles={onViewCandidate}
                          />
                        ))
                      ) : (
                        <p className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 text-sm text-brand-grey">
                          No candidates in this group.
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
            {selectedId ? (
              <div className="min-h-0 w-1/2 flex-1">
                <CandidatePreview
                  preview={preview}
                  loading={previewLoading}
                  match={selectedMatch}
                  onClose={() => {
                    setSelectedId(null);
                    setPreview(null);
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
