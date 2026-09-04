"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { SlidersHorizontal, RefreshCw, ChevronDown, Lightbulb, Archive, TrendingUp, Search, X } from "lucide-react";
import { UnverifiedQueuePanel } from "@/components/pilot-requirements/UnverifiedQueuePanel";
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
import { BulkPositionSkipBar } from "@/components/recruiting-jobs/BulkPositionSkipBar";
import { SCAN_EXCLUSION_LABELS, type ScanExclusionReason } from "@/lib/candidates/scan-exclusion";
import { filterMatches, searchTerms } from "@/lib/matching/match-search";
import { isPositionSkipReason, type PositionDecisionValue } from "@/lib/matching/position-skip";
// scan-pool is a PURE module (no Prisma import) precisely so client components can
// read these, per its own header comment.
import { CURRENT_MATCH_LIMIT, ARCHIVE_MATCH_LIMIT } from "@/lib/candidates/scan-pool";
import type { JobScreeningData } from "@/lib/data/job-screening";
import type { PilotRequirementCandidateMatch, ReadinessLabel } from "@/lib/matching/pilot-requirement-matches";

const TIER_ORDER: ReadinessLabel[] = ["Strong signal", "Worth a look", "Needs review"];

type Tab = "all" | ReadinessLabel;

/**
 * A position decision made in THIS session by the bulk bar, before any refetch.
 * null means "cleared, back to the engine's call"; an id absent from the record
 * has not been touched at all, which is why membership is tested with `in`.
 */
type BulkDecision = { reason: PositionDecisionValue; note: string; at: string } | null;

/**
 * Lay a bulk decision over a card the server sent, so the sweep is visible the
 * instant it is applied rather than after a round trip.
 *
 * Applied to BOTH the merged list and the server's own set-aside list: someone
 * who is set aside but did not make the ranked scan appears only in the latter,
 * and skipping them there is how they would silently vanish from the page when
 * a bulk undo put them back.
 */
function withBulkDecision(
  match: PilotRequirementCandidateMatch,
  bulk: Record<string, BulkDecision>
): PilotRequirementCandidateMatch {
  if (!(match.candidateId in bulk)) return match;
  const decision = bulk[match.candidateId];
  if (!decision) return { ...match, setAsideReason: null, positionSkip: null };
  return {
    ...match,
    // KEEP is a decision but not a set-aside — it pins someone INTO the ranked
    // list against the automatic overqualified catch.
    setAsideReason: isPositionSkipReason(decision.reason) ? decision.reason : null,
    positionSkip: { reason: decision.reason, note: decision.note, at: decision.at, by: null, automatic: false }
  };
}

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
  const [overqualifiedOpen, setOverqualifiedOpen] = useState(false);
  // A rescan returns its own set-aside group; until then use the server's.
  const [rescanSetAside, setRescanSetAside] = useState<PilotRequirementCandidateMatch[] | null>(null);
  const [rescanOverqualified, setRescanOverqualified] = useState<PilotRequirementCandidateMatch[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<CandidatePreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  // Bulk triage: a keyword filter over the cards, a tick per card, and the
  // decisions applied in this session laid over the server's data.
  const [filter, setFilter] = useState("");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [bulkSkips, setBulkSkips] = useState<Record<string, BulkDecision>>({});

  const appliedIds = useMemo(() => new Set(data.applicantIds), [data.applicantIds]);
  const terms = useMemo(() => searchTerms(filter), [filter]);

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
        return withBulkDecision(
          {
            ...match,
            readiness: moved ?? match.readiness,
            overridden: moved ? true : match.overridden,
            excludedReason
          },
          bulkSkips
        );
      })
      .filter((match) => includeExcluded || !match.excludedReason);
  }, [data.applicants, best, overrides, exclusions, includeExcluded, bulkSkips]);

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
    for (const raw of rescanSetAside ?? data.setAside) {
      if (byId.has(raw.candidateId)) continue;
      // A bulk decision from this session wins over the server's snapshot —
      // including one that UN-sets someone aside, which drops them from here.
      const match = withBulkDecision(raw, bulkSkips);
      if (match.setAsideReason) byId.set(match.candidateId, match);
    }
    return [...byId.values()].sort(
      (a, b) => b.score - a.score || a.candidateName.localeCompare(b.candidateName)
    );
  }, [merged, rescanSetAside, data.setAside, bulkSkips]);

  const ranked = useMemo(() => merged.filter((match) => !match.setAsideReason), [merged]);

  // Captain seats only. Held out of the readiness tiers so they do not sit above
  // people who fit the seat, but NOT set aside — they are still candidates, and
  // on a high-minimum seat plenty of hours is exactly what you want.
  // Comes from the server as its own list with its own budget. Filtering it out
  // of `ranked` client-side would find nothing: the scan already partitions
  // them, precisely so they are not cut off by the ranked slice.
  const likelyOverqualified = useMemo(() => {
    const byId = new Map<string, PilotRequirementCandidateMatch>();
    for (const match of merged) if (match.likelyOverqualified && !match.setAsideReason) byId.set(match.candidateId, match);
    for (const raw of rescanOverqualified ?? data.likelyOverqualified) {
      if (byId.has(raw.candidateId)) continue;
      // A bulk skip applied here moves the person to Set aside, so they must
      // leave this group rather than appear in both.
      const match = withBulkDecision(raw, bulkSkips);
      if (!match.setAsideReason) byId.set(match.candidateId, match);
    }
    return [...byId.values()].sort(
      (a, b) => b.score - a.score || a.candidateName.localeCompare(b.candidateName)
    );
  }, [merged, rescanOverqualified, data.likelyOverqualified, bulkSkips]);
  const currentMatches = useMemo(
    () => ranked.filter((match) => !match.fromArchive && !match.likelyOverqualified),
    [ranked]
  );
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

  // --- Keyword filter + bulk selection -------------------------------------
  //
  // The filter narrows every lane at once, so what is on screen after typing
  // "jet 0" is the whole answer rather than one group's worth of it. It searches
  // the text the cards actually render (see lib/matching/match-search.ts) — and
  // only the cards on this list, which is the top-50 slice of each half of the
  // pool, not the pool itself. The hint under the box says so.
  const visibleGrouped = useMemo(() => {
    const groups: Record<ReadinessLabel, PilotRequirementCandidateMatch[]> = {
      "Strong signal": [],
      "Worth a look": [],
      "Needs review": []
    };
    for (const tier of TIER_ORDER) groups[tier] = filterMatches(grouped[tier], terms);
    return groups;
  }, [grouped, terms]);
  const visibleOverqualified = useMemo(() => filterMatches(likelyOverqualified, terms), [likelyOverqualified, terms]);
  const visibleSetAside = useMemo(() => filterMatches(setAsideMatches, terms), [setAsideMatches, terms]);
  const visibleArchive = useMemo(() => filterMatches(archiveMatches, terms), [archiveMatches, terms]);

  const laneTotal =
    currentMatches.length + likelyOverqualified.length + setAsideMatches.length + archiveMatches.length;
  const laneShown =
    TIER_ORDER.reduce((sum, tier) => sum + visibleGrouped[tier].length, 0) +
    visibleOverqualified.length +
    visibleSetAside.length +
    visibleArchive.length;

  /**
   * Exactly the cards rendered right now — respecting the tier tab AND whether
   * a group is expanded.
   *
   * "Select all" has to mean what it says. Reaching into a collapsed group would
   * apply a decision to people the recruiter cannot see, which is the one thing
   * a bulk control must never do.
   */
  const renderedIds = useMemo(() => {
    const ids: string[] = [];
    for (const tier of TIER_ORDER) {
      if (tab !== "all" && tab !== tier) continue;
      if (collapsed[tier]) continue;
      for (const match of visibleGrouped[tier]) ids.push(match.candidateId);
    }
    if (overqualifiedOpen) for (const match of visibleOverqualified) ids.push(match.candidateId);
    if (setAsideOpen) for (const match of visibleSetAside) ids.push(match.candidateId);
    if (archiveOpen) for (const match of visibleArchive) ids.push(match.candidateId);
    return [...new Set(ids)];
  }, [
    tab,
    collapsed,
    visibleGrouped,
    overqualifiedOpen,
    visibleOverqualified,
    setAsideOpen,
    visibleSetAside,
    archiveOpen,
    visibleArchive
  ]);

  /**
   * The selection is DERIVED from what is on screen rather than stored flat, so
   * narrowing the filter or collapsing a group cannot leave an invisible person
   * ticked. Re-widening brings their tick back, which is what someone who
   * collapsed a group by accident expects.
   */
  const selectedIds = useMemo(() => renderedIds.filter((id) => checked[id]), [renderedIds, checked]);
  const allRenderedSelected = renderedIds.length > 0 && selectedIds.length === renderedIds.length;
  // A position decision needs a position, and writing one needs edit rights.
  const bulkSelectable = data.canEdit && Boolean(data.requirementId);

  function toggleChecked(candidateId: string) {
    setChecked((current) => ({ ...current, [candidateId]: !current[candidateId] }));
  }

  function toggleAllRendered() {
    const next = !allRenderedSelected;
    setChecked((current) => {
      const updated = { ...current };
      for (const id of renderedIds) updated[id] = next;
      return updated;
    });
  }

  function applyBulk(ids: string[], reason: PositionDecisionValue | null, note: string) {
    const at = new Date().toISOString();
    setBulkSkips((current) => {
      const updated = { ...current };
      for (const id of ids) updated[id] = reason === null ? null : { reason, note, at };
      return updated;
    });
  }

  function rescan(include: boolean) {
    if (!data.requirementId) return;
    setScanError(null);
    startScan(async () => {
      const res = await scanRequirementMatches(data.requirementId!, include);
      if (res.ok && res.data) {
        setBest(res.data.matches);
        setRescanSetAside(res.data.setAside);
        setRescanOverqualified(res.data.likelyOverqualified);
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

  /**
   * Keep the detail pane beside the card you actually clicked.
   *
   * The candidate list scrolls inside its own column, so the pane — a sibling
   * column whose content is top-aligned — always opened at the top of the
   * screen no matter how far down the list you were. Scroll to someone, click
   * them, and their details appeared somewhere you were not looking.
   *
   * Offset is measured from the card, re-measured while the list scrolls, and
   * clamped so the pane can never be pushed off the bottom.
   */
  const listRef = useRef<HTMLDivElement | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const [paneOffset, setPaneOffset] = useState(0);

  useEffect(() => {
    if (!selectedId) {
      setPaneOffset(0);
      return;
    }
    const list = listRef.current;
    if (!list) return;

    const align = () => {
      const card = list.querySelector<HTMLElement>(`[data-candidate-card="${CSS.escape(selectedId)}"]`);
      if (!card) return;
      const offset = card.getBoundingClientRect().top - list.getBoundingClientRect().top;
      const room = list.clientHeight - (paneRef.current?.offsetHeight ?? 0);
      setPaneOffset(Math.max(0, Math.min(offset, Math.max(0, room))));
    };

    align();
    // The card moves under the pointer while the list scrolls; follow it.
    list.addEventListener("scroll", align, { passive: true });
    const observer = new ResizeObserver(align);
    if (paneRef.current) observer.observe(paneRef.current);
    return () => {
      list.removeEventListener("scroll", align);
      observer.disconnect();
    };
  }, [selectedId, preview, previewLoading]);

  // "All" is only honest when the list was not cut off. currentMatches is the
  // CURRENT_MATCH_LIMIT slice, so a list sitting exactly at the limit is a top-N
  // shortlist — and labelling that "All 12" is what made it read as "twelve people
  // qualify" when 422 had actually been scored. Say "Top" whenever it is capped.
  const currentCapped = currentMatches.length >= CURRENT_MATCH_LIMIT;
  const archiveCapped = archiveMatches.length >= ARCHIVE_MATCH_LIMIT;
  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: "all", label: currentCapped ? "Top" : "All", count: currentMatches.length },
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

          {/* Filter the cards on this list, then act on the whole selection at
              once. Searches what the cards show, so "jet 0" finds everyone whose
              Jet time factor reads 0 hrs. */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[15rem] flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-grey dark:text-slate-400" />
              <input
                type="search"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter these candidates — try: jet 0"
                aria-label="Filter the candidates on this list by keyword"
                className="w-full rounded-element border border-brand-lea/20 bg-white py-1.5 pl-7 pr-7 text-xs text-brand-lea outline-none transition placeholder:text-brand-grey/70 focus:border-brand-gold dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
              />
              {filter ? (
                <button
                  type="button"
                  onClick={() => setFilter("")}
                  aria-label="Clear the filter"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-element p-0.5 text-brand-grey transition hover:text-brand-lea dark:text-slate-400"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            {terms.length > 0 ? (
              <span className="text-[11px] font-semibold text-brand-lea dark:text-slate-100">
                {laneShown} of {laneTotal} on this list match
              </span>
            ) : null}

            {data.canEdit && data.requirementId && renderedIds.length > 0 ? (
              <button
                type="button"
                onClick={toggleAllRendered}
                className="inline-flex items-center gap-1.5 rounded-element border border-brand-lea/20 px-2.5 py-1.5 text-[11px] font-semibold text-brand-eden transition hover:border-brand-gold hover:bg-brand-cloudDancer/60 hover:shadow-glow dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
              >
                {allRenderedSelected ? "Clear all" : `Select all ${renderedIds.length} shown`}
              </button>
            ) : null}
          </div>

          {terms.length > 0 ? (
            <p className="mt-1 text-[10px] text-brand-grey dark:text-slate-400">
              Every term has to land on the <strong className="font-semibold">same line</strong> of the card, in any
              order — so “jet 0” means the Jet time line reads 0, not a card with jet somewhere and a 0 somewhere else.
              Numbers match whole (“0” is not the 0 inside 500 or 4,000); words match from the start, so “smi” finds
              Smith. This searches the cards on this list only — the top {CURRENT_MATCH_LIMIT} current and top{" "}
              {ARCHIVE_MATCH_LIMIT} archived, not all {(scan?.count ?? data.scannedCount).toLocaleString()} scored.
            </p>
          ) : null}

          {data.canEdit && data.requirementId ? (
            <BulkPositionSkipBar
              requirementId={data.requirementId}
              candidateIds={selectedIds}
              onClear={() => setChecked({})}
              onApplied={applyBulk}
            />
          ) : null}

          {data.canEdit ? (
            <p className="mt-2 text-[11px] text-brand-grey dark:text-slate-400">
              Click a name to preview the candidate on the right. Tick the boxes (or “Select all shown”) to set a whole
              filtered batch aside in one go — that only ever reaches cards you can see, and it is undoable. Disagree
              with a read? Use “Move to” — the move sticks and the system learns. To keep someone out of scans (test
              record, hired, didn’t pass, not a culture fit, not eligible to hire), set “Scan eligibility” on their
              card. Skips are reversible — the Matchboard’s Skipped list shows everyone held out and puts them back.
            </p>
          ) : null}

          {learn ? (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-element bg-value-leadership-light px-2.5 py-1.5 text-[11px] font-medium text-value-leadership-dark">
              <Lightbulb className="h-3.5 w-3.5 shrink-0" /> {learn}
            </p>
          ) : null}

          <div className="mt-3 flex min-h-0 flex-1 gap-3">
          <div
            ref={listRef}
            className={clsx("min-h-0 space-y-2 overflow-y-auto pr-1", selectedId ? "w-1/2 shrink-0" : "w-full flex-1")}
          >
            {TIER_ORDER.map((tier) => {
              if (tab !== "all" && tab !== tier) return null;
              const list = visibleGrouped[tier];
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
                      <FilteredCount shown={list.length} total={grouped[tier].length} filtering={terms.length > 0} />
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
                            selectable={bulkSelectable}
                            checked={!!checked[match.candidateId]}
                            onToggleChecked={toggleChecked}
                          />
                        ))
                      ) : (
                        <p className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 text-sm text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                          {terms.length > 0
                            ? `No one in this group matches “${filter.trim()}”.`
                            : "No candidates in this group."}
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}

            <UnverifiedQueuePanel requirementId={data.requirementId} includeExcluded={includeExcluded} />

            {/* Captain seats where total time is 2x+ the minimum. Its own group
                at the bottom rather than a skip: on a high-minimum seat plenty
                of hours is exactly what you want, so these stay candidates. */}
            {visibleOverqualified.length > 0 ? (
              <div className="overflow-hidden rounded border border-value-leadership-dark/20 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setOverqualifiedOpen((value) => !value)}
                  aria-expanded={overqualifiedOpen}
                  className="flex w-full items-center justify-between gap-2 bg-value-leadership-light/40 px-3 py-2 text-left transition hover:bg-value-leadership-light/70 dark:bg-white/5"
                >
                  <span className="flex items-center gap-2">
                    <TrendingUp className="h-3.5 w-3.5 text-value-leadership-dark" />
                    <span className="text-[11px] font-semibold text-brand-lea dark:text-slate-100">Likely overqualified</span>
                    {terms.length > 0 ? (
                      <FilteredCount shown={visibleOverqualified.length} total={likelyOverqualified.length} filtering />
                    ) : (
                      <GroupCount shown={likelyOverqualified.length} total={data.likelyOverqualifiedTotal} />
                    )}
                  </span>
                  <ChevronDown
                    className={clsx("h-4 w-4 text-brand-grey transition-transform dark:text-slate-400", !overqualifiedOpen && "-rotate-90")}
                  />
                </button>
                {overqualifiedOpen ? (
                  <div className="space-y-3 p-3">
                    <p className="text-[11px] text-brand-grey dark:text-slate-400">
                      Captains whose total time is at least twice this seat&apos;s minimum. They are still candidates and
                      still scored — just ranked below people who fit the seat, because on a low-minimum seat this much
                      experience is often a flight risk. Use &quot;Skip — Overqualified&quot; on a card to set one aside
                      properly.
                    </p>
                    {visibleOverqualified.map((match) => (
                      <MatchCard
                        key={`over:${match.candidateId}`}
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
                        selectable={bulkSelectable}
                        checked={!!checked[match.candidateId]}
                        onToggleChecked={toggleChecked}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Set aside on this position only. Deliberately still on the page:
                the automatic catch fires off self-reported hours, which are
                known to disagree between a candidate's own documents, so a
                wrong call has to be visible and reversible. */}
            {visibleSetAside.length > 0 ? (
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
                    {terms.length > 0 ? (
                      <FilteredCount shown={visibleSetAside.length} total={setAsideMatches.length} filtering />
                    ) : (
                      <GroupCount shown={setAsideMatches.length} total={data.setAsideTotal} />
                    )}
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
                    {visibleSetAside.map((match) => (
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
                        selectable={bulkSelectable}
                        checked={!!checked[match.candidateId]}
                        onToggleChecked={toggleChecked}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* The archive lane. Held apart from the tiers above on purpose:
                these are historical Jazz records, and before this they had
                never been scanned once. */}
            {visibleArchive.length > 0 ? (
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
                    <span className="text-xs text-brand-grey dark:text-slate-400">
                      {terms.length > 0
                        ? `(${visibleArchive.length} of ${archiveMatches.length} match)`
                        : archiveCapped
                          ? `(top ${archiveMatches.length} of ${scannedArchive.toLocaleString()})`
                          : `(${archiveMatches.length})`}
                    </span>
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
                    {visibleArchive.map((match) => (
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
                        selectable={bulkSelectable}
                        checked={!!checked[match.candidateId]}
                        onToggleChecked={toggleChecked}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
            {selectedId ? (
              <div
                ref={paneRef}
                className="min-h-0 w-1/2 flex-1 self-start transition-[margin] duration-150"
                style={{ marginTop: paneOffset }}
              >
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

/**
 * A group's size, and the true total when the list has been cut to a cap.
 *
 * "(40)" on a group capped at 40 is indistinguishable from a group that really
 * holds 40 — which is how the old 40- and 60-row ceilings sat unnoticed while
 * being hit exactly. When nothing was cut this renders as before; when something
 * was, it says so and colours gold rather than quietly under-reporting.
 *
 * The shown count can legitimately exceed the server total — a rescan or an
 * in-session skip adds rows client-side — so the "of" only appears when the
 * server actually truncated.
 */
/**
 * A group's size under the keyword filter.
 *
 * Kept apart from GroupCount below because the two hide different things and
 * conflating them would be a lie in one direction or the other: GroupCount's
 * "of" means the server cut the list short, this one means the filter did. When
 * no filter is on it renders exactly what the plain count always did.
 */
function FilteredCount({ shown, total, filtering }: { shown: number; total: number; filtering: boolean }) {
  if (!filtering) return <span className="text-xs text-brand-grey dark:text-slate-400">({total})</span>;
  return (
    <span
      className={clsx("text-xs", shown < total ? "font-semibold text-brand-gold" : "text-brand-grey dark:text-slate-400")}
      title={`${shown} of the ${total} on this list match the filter`}
    >
      ({shown} of {total} match)
    </span>
  );
}

function GroupCount({ shown, total }: { shown: number; total: number }) {
  const truncated = total > shown;
  return (
    <span
      className={clsx(
        "text-xs",
        truncated ? "font-semibold text-brand-gold" : "text-brand-grey dark:text-slate-400"
      )}
      title={truncated ? `Showing the first ${shown} of ${total} — the rest are not on this list` : undefined}
    >
      ({truncated ? `${shown} of ${total}` : shown})
    </span>
  );
}
