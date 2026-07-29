"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { SlidersHorizontal, RefreshCw, ChevronDown, Lightbulb, Archive, TrendingUp } from "lucide-react";
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
  const [scan, setScan] = useState<{ count: number; current: number; archive: number; at: string } | null>(null);
  const [scanning, startScan] = useTransition();
  const [moving, startMove] = useTransition();
  const [scanError, setScanError] = useState<string | null>(null);
  const [learn, setLearn] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, ReadinessLabel>>({});
  const [exclusions, setExclusions] = useState<Record<string, ScanExclusionReason | null>>({});
  const [includeExcluded, setIncludeExcluded] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [archiveOpen, setArchiveOpen] = useState(true);
  const [setAsideOpen, setSetAsideOpen] = useState(false);
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

  // Two lanes, not one ranking. Archived (historical Jazz) people frequently
  // out-score live candidates, so merging them into a single top-N pushed the
  // working pipeline off the board. The archive is a deliberate rediscovery
  // list sitting underneath the current pool.
  // Set aside for THIS position — a recruiter's skip or the automatic
  // overqualified catch. Pulled out of the ranked lanes but never hidden, so a
  // wrong call is visible and one click puts them back.
  const setAsideMatches = useMemo(() => {
    const byId = new Map<string, PilotRequirementCandidateMatch>();
    for (const match of merged) if (match.setAsideReason) byId.set(match.candidateId, match);
    for (const match of data.setAside) if (!byId.has(match.candidateId)) byId.set(match.candidateId, match);
    return [...byId.values()].sort(
      (a, b) => b.score - a.score || a.candidateName.localeCompare(b.candidateName)
    );
  }, [merged, data.setAside]);

  const ranked = useMemo(() => merged.filter((match) => !match.setAsideReason), [merged]);
  const currentMatches = useMemo(() => ranked.filter((match) => !match.fromArchive), [ranked]);
  const archiveMatches = useMemo(
    () => ranked.filter((match) => match.fromArchive).sort((a, b) => b.score - a.score || a.candidateName.localeCompare(b.candidateName)),
    [ranked]
  );

  const grouped = useMemo(() => {
    const groups: Record<ReadinessLabel, PilotRequirementCandidateMatch[]> = {
      "Strong signal": [],
      "Worth a look": [],
      "Needs review": []
    };
    for (const match of currentMatches) groups[match.readiness].push(match);
    for (const tier of TIER_ORDER) {
      groups[tier].sort((a, b) => b.score - a.score || a.candidateName.localeCompare(b.candidateName));
    }
    return groups;
  }, [currentMatches]);

  function rescan(include: boolean) {
    if (!data.requirementId) return;
    setScanError(null);
    startScan(async () => {
      const res = await scanRequirementMatches(data.requirementId!, include);
      if (res.ok && res.data) {
        setBest(res.data.matches);
        setScan({
          count: res.data.scannedCount,
          current: res.data.scannedCurrent,
          archive: res.data.scannedArchive,
          at: res.data.scannedAt
        });
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
        ? `Ignoring ${candidateName} in scans — ${SCAN_EXCLUSION_LABELS[reason]}. They won't appear in new scans unless “Include skipped” is on, and you can put them back from the Skipped list.`
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
    { key: "all", label: "All", count: currentMatches.length },
    ...TIER_ORDER.map((tier) => ({ key: tier, label: tier, count: grouped[tier].length }))
  ];

  const scannedCurrent = scan?.current ?? data.scannedCurrent;
  const scannedArchive = scan?.archive ?? data.scannedArchive;

  return (
    <section className="flex h-full flex-col overflow-hidden rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Screening</p>
          <h3 className="text-base font-semibold text-brand-lea dark:text-slate-100">Candidates by the numbers</h3>
          <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
            Decision support for this job — not a ranking, no one is filtered out. Never uses age, name, gender or
            location.
          </p>
        </div>
        {data.hasRequirement ? (
          <Link
            href="/pilot-requirements/scoring"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-element border border-brand-lea/15 px-2.5 py-1.5 text-xs font-semibold text-brand-eden transition hover:border-brand-sweet hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:bg-white/5"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> Scoring setup
          </Link>
        ) : null}
      </div>

      {!data.hasRequirement ? (
        <div className="mt-4 rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-4 text-sm text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
          This job has no linked pilot requirement yet, so there are no aircraft, seat, or hour minimums to score
          against. Link a requirement profile (see Linked requirements) to enable screening.
        </div>
      ) : (
        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-element bg-brand-cloudDancer/45 px-3 py-2 dark:bg-white/5">
            <div className="text-[11px] text-brand-grey dark:text-slate-400">
              Scored against <span className="font-semibold text-brand-lea dark:text-slate-100">{data.requirementTitle}</span> ·{" "}
              <span className="font-semibold text-brand-lea dark:text-slate-100">{(scan?.count ?? data.scannedCount).toLocaleString()}</span>{" "}
              candidates ({scannedCurrent.toLocaleString()} current + {scannedArchive.toLocaleString()} archived)
              {scan ? <span> · scanned {formatScanTime(scan.at)}</span> : null}
            </div>
            <div className="flex items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-brand-grey dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={includeExcluded}
                  onChange={toggleIncludeExcluded}
                  disabled={scanning}
                  className="h-3.5 w-3.5 accent-brand-lea"
                />
                Include skipped
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
                  "inline-flex items-center gap-1 rounded border px-2.5 py-1 text-[11px] font-semibold transition hover:shadow-glow",
                  tab === entry.key
                    ? "border-brand-gold bg-brand-sweet/20 text-brand-lea dark:text-slate-100"
                    : "border-brand-lea/15 text-brand-grey hover:border-brand-sweet hover:bg-brand-cloudDancer/55 dark:border-white/10 dark:text-slate-400 dark:bg-white/5"
                )}
              >
                {entry.label} <span className="opacity-70">{entry.count}</span>
              </button>
            ))}
          </div>

          {data.canEdit ? (
            <p className="mt-2 text-[11px] text-brand-grey dark:text-slate-400">
              Click a name to preview the candidate on the right. Disagree with a read? Use “Move to” — the move
              sticks and the system learns. To keep someone out of scans (test record, hired, didn’t pass, not a
              culture fit, not eligible to hire), set “Scan eligibility” on their card. Skips are reversible — the
              Matchboard’s Skipped list shows everyone held out and puts them back.
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
                <div key={tier} className="overflow-hidden rounded border border-brand-lea/10 dark:border-white/10">
                  <button
                    type="button"
                    onClick={() => toggle(tier)}
                    aria-expanded={!isCollapsed}
                    className="flex w-full items-center justify-between gap-2 bg-brand-cloudDancer/35 px-3 py-2 text-left transition hover:bg-brand-cloudDancer/60 dark:bg-white/5"
                  >
                    <span className="flex items-center gap-2">
                      <span className={clsx("rounded px-2.5 py-0.5 text-[11px] font-semibold", readinessStyles[tier])}>
                        {tier}
                      </span>
                      <span className="text-xs text-brand-grey dark:text-slate-400">({list.length})</span>
                    </span>
                    <ChevronDown
                      className={clsx("h-4 w-4 text-brand-grey transition-transform dark:text-slate-400", isCollapsed && "-rotate-90")}
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
                        <p className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 text-sm text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                          No candidates in this group.
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {/* Set aside on this position only. Deliberately still on the page:
                the automatic catch fires off self-reported hours, which are
                known to disagree between a candidate's own documents, so a
                wrong call has to be visible and reversible. */}
            {setAsideMatches.length > 0 ? (
              <div className="overflow-hidden rounded border border-value-leadership-dark/25 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setSetAsideOpen((value) => !value)}
                  aria-expanded={setAsideOpen}
                  className="flex w-full items-center justify-between gap-2 bg-value-leadership-light/60 px-3 py-2 text-left transition hover:bg-value-leadership-light dark:bg-white/5"
                >
                  <span className="flex items-center gap-2">
                    <TrendingUp className="h-3.5 w-3.5 text-value-leadership-dark" />
                    <span className="text-[11px] font-semibold text-brand-lea dark:text-slate-100">Set aside on this position</span>
                    <span className="text-xs text-brand-grey dark:text-slate-400">({setAsideMatches.length})</span>
                  </span>
                  <ChevronDown
                    className={clsx("h-4 w-4 text-brand-grey transition-transform dark:text-slate-400", !setAsideOpen && "-rotate-90")}
                  />
                </button>
                {setAsideOpen ? (
                  <div className="space-y-3 p-3">
                    <p className="text-[11px] text-brand-grey dark:text-slate-400">
                      Held out of the ranked lists above for this position only. Everyone here is still in the system
                      and still competing for every other opening. Overqualified is caught automatically when total
                      time reaches twice this seat&apos;s minimum — use &quot;Keep on this position&quot; on any card
                      where that call is wrong.
                    </p>
                    {setAsideMatches.map((match) => (
                      <MatchCard
                        key={`aside:${match.candidateId}`}
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
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* The archive lane. Held apart from the tiers above on purpose:
                these are historical Jazz records, and before this they had
                never been scanned once. */}
            {archiveMatches.length > 0 ? (
              <div className="overflow-hidden rounded border border-brand-eden/25 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setArchiveOpen((value) => !value)}
                  aria-expanded={archiveOpen}
                  className="flex w-full items-center justify-between gap-2 bg-brand-sweet/20 px-3 py-2 text-left transition hover:bg-brand-sweet/30 dark:bg-white/5"
                >
                  <span className="flex items-center gap-2">
                    <Archive className="h-3.5 w-3.5 text-brand-eden dark:text-slate-300" />
                    <span className="text-[11px] font-semibold text-brand-lea dark:text-slate-100">From the archive</span>
                    <span className="text-xs text-brand-grey dark:text-slate-400">({archiveMatches.length})</span>
                  </span>
                  <ChevronDown
                    className={clsx("h-4 w-4 text-brand-grey transition-transform dark:text-slate-400", !archiveOpen && "-rotate-90")}
                  />
                </button>
                {archiveOpen ? (
                  <div className="space-y-3 p-3">
                    <p className="text-[11px] text-brand-grey dark:text-slate-400">
                      People already in the system from earlier hiring rounds, ranked separately so they never crowd out
                      the current pool. Most have no structured hours on file, so their read comes largely from resume
                      text — worth a look rather than a like-for-like comparison.
                    </p>
                    {archiveMatches.map((match) => (
                      <MatchCard
                        key={`archive:${match.candidateId}`}
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
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
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
