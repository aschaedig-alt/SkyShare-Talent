"use client";

import { useMemo, useState, useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import {
  Search,
  Plane,
  User,
  Radar,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
  History,
  Lightbulb,
  Undo2,
  EyeOff
} from "lucide-react";
import { loadMatchboardDetail, loadSkippedPool } from "@/app/matching/matchboard-actions";
import { setCandidateScanExclusion } from "@/app/pilot-requirements/scoring-actions";
import { JobScreeningPanel } from "@/components/recruiting-jobs/JobScreeningPanel";
import { RoleMatchCard } from "@/components/matchboard/RoleMatchCard";
import {
  SCAN_EXCLUSION_REASONS,
  SCAN_EXCLUSION_LABELS,
  type ScanExclusionReason
} from "@/lib/candidates/scan-exclusion";
import type { SkippedCandidate } from "@/lib/candidates/skipped-pool";
import type { MatchboardSubjects, CandidateRoleMatches } from "@/lib/matching/matchboard";
import type { JobScreeningData } from "@/lib/data/job-screening";

export type MatchboardMode = "role" | "candidate" | "skipped";

/**
 * The candidate picker now spans the whole pool (3,400+ people rather than the
 * old 200), so the rendered list is capped while the SEARCH still runs over
 * everyone. Rendering every archived record produced a visibly janky sidebar.
 */
const VISIBLE_SUBJECTS = 200;

function seatTag(seat: string | null) {
  const s = (seat ?? "").toLowerCase();
  if (s === "pic") return { label: "PIC", cls: "bg-value-teamwork-light text-value-teamwork-dark" };
  if (s === "sic") return { label: "SIC", cls: "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400" };
  return { label: seat || "Support", cls: "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400" };
}

export function MatchboardWorkspace({
  subjects,
  mode: modeProp,
  selectedId: selectedIdProp,
  roleData: roleDataProp,
  candidateData: candidateDataProp
}: {
  subjects: MatchboardSubjects;
  mode: MatchboardMode;
  selectedId: string | null;
  roleData: JobScreeningData | null;
  candidateData: CandidateRoleMatches | null;
}) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<MatchboardMode>(modeProp);
  const [selectedId, setSelectedId] = useState<string | null>(selectedIdProp);
  const [roleData, setRoleData] = useState<JobScreeningData | null>(roleDataProp);
  const [candidateData, setCandidateData] = useState<CandidateRoleMatches | null>(candidateDataProp);
  const [loading, setLoading] = useState(false);
  const reqRef = useRef(0);

  // Client-side selection: highlight instantly, then load the (heavy) screening
  // without a full page navigation. The initial selection's data comes from the
  // server render (props); every click after loads via the read-only action.
  function select(nextMode: MatchboardMode, id?: string | null) {
    setMode(nextMode);
    setSelectedId(id ?? null);
    if (nextMode === "skipped") {
      setRoleData(null);
      setCandidateData(null);
      setLoading(false);
      return;
    }
    if (!id) {
      setRoleData(null);
      setCandidateData(null);
      setLoading(false);
      return;
    }
    const req = ++reqRef.current;
    setRoleData(null);
    setCandidateData(null);
    setLoading(true);
    loadMatchboardDetail(nextMode, id)
      .then((res) => {
        if (req !== reqRef.current) return;
        setLoading(false);
        setRoleData(res.roleData);
        setCandidateData(res.candidateData);
      })
      .catch(() => {
        if (req === reqRef.current) setLoading(false);
      });
  }
  const go = select;

  // Keep mode/id in the URL (no navigation) so refresh + new-tab still work.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("mode", mode);
    if (selectedId) url.searchParams.set("id", selectedId);
    else url.searchParams.delete("id");
    window.history.replaceState(null, "", url.toString());
  }, [mode, selectedId]);

  const filteredRoles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subjects.roles;
    return subjects.roles.filter((r) =>
      [r.title, r.seat, r.aircraft, r.typeRating].filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [subjects.roles, query]);

  const filteredCandidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subjects.candidates;
    return subjects.candidates.filter((c) => [c.name, c.title].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [subjects.candidates, query]);

  return (
    <div className="px-5 py-5 lg:px-8">
      <section className="mb-4 rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Recruiting</p>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-brand-lea dark:text-slate-100">
          <Radar className="h-6 w-6 text-brand-gold" /> Matchboard
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-brand-grey dark:text-slate-400">
          Two-way candidate–role matching. View a role to see who qualifies, or a candidate to see every role that fits —
          and jump between the two. Seat fit flags pilots who are overqualified for a first-officer seat.
        </p>

        <div className="mt-4 inline-flex rounded border border-brand-lea/15 bg-brand-cloudDancer/40 p-1 dark:border-white/10 dark:bg-white/5">
          <button
            type="button"
            onClick={() => go("role")}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded px-4 py-1.5 text-sm font-semibold transition hover:shadow-glow",
              mode === "role" ? "bg-brand-lea text-white" : "text-brand-grey hover:text-brand-lea dark:text-slate-400"
            )}
          >
            <Plane className="h-4 w-4" /> By role
          </button>
          <button
            type="button"
            onClick={() => go("candidate")}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded px-4 py-1.5 text-sm font-semibold transition hover:shadow-glow",
              mode === "candidate" ? "bg-brand-lea text-white" : "text-brand-grey hover:text-brand-lea dark:text-slate-400"
            )}
          >
            <User className="h-4 w-4" /> By candidate
          </button>
          <button
            type="button"
            onClick={() => go("skipped")}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded px-4 py-1.5 text-sm font-semibold transition hover:shadow-glow",
              mode === "skipped" ? "bg-brand-lea text-white" : "text-brand-grey hover:text-brand-lea dark:text-slate-400"
            )}
          >
            <EyeOff className="h-4 w-4" /> Skipped
          </button>
        </div>
      </section>

      {mode === "skipped" ? (
        <SkippedPoolPanel onViewCandidate={(id) => go("candidate", id)} />
      ) : (
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex max-h-[78vh] flex-col overflow-hidden rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <div className="shrink-0 border-b border-brand-lea/10 p-3 dark:border-white/10">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-grey dark:text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={mode === "role" ? "Search roles" : "Search candidates"}
                className="w-full rounded border border-brand-lea/20 bg-white py-2 pl-8 pr-3 text-sm text-brand-black outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {mode === "role"
              ? filteredRoles.map((role) => {
                  const seat = seatTag(role.seat);
                  const active = role.id !== "" && role.id === selectedId;
                  const disabled = role.noProfile;
                  const cardClass = clsx(
                    "mb-1.5 block w-full rounded border p-2.5 text-left transition hover:shadow-glow",
                    disabled
                      ? "cursor-default border-brand-lea/10 opacity-60 dark:border-white/10"
                      : active
                        ? "border-brand-gold bg-brand-sweet/18 dark:bg-brand-sweet/25"
                        : "border-brand-lea/10 hover:border-brand-sweet hover:bg-brand-cloudDancer/55 dark:border-white/10 dark:bg-white/5"
                  );
                  const inner = (
                    <>
                      <div className="flex items-center gap-1.5">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-brand-lea dark:text-slate-100">{role.title}</span>
                        {role.noProfile ? (
                          <span className="shrink-0 rounded bg-value-leadership-light px-1.5 py-0.5 text-[9px] font-bold uppercase text-value-leadership-dark">No profile</span>
                        ) : null}
                        {role.status === "Archived" ? (
                          <span className="shrink-0 rounded bg-brand-cloudDancer px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand-grey dark:bg-white/5 dark:text-slate-400">Archived</span>
                        ) : null}
                        {role.unmatched ? (
                          <span className="shrink-0 rounded bg-value-customerFocus-light px-1.5 py-0.5 text-[9px] font-bold uppercase text-value-customerFocus-dark">Review</span>
                        ) : null}
                        <span className={clsx("shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase", seat.cls)}>{seat.label}</span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-brand-grey dark:text-slate-400">
                        {role.noProfile
                          ? "No requirement profile yet — not scannable"
                          : [role.typeRating, `${role.applicantCount} applied`, role.dupeCount > 1 ? `${role.dupeCount} variants` : null]
                              .filter(Boolean)
                              .join(" · ")}
                      </div>
                    </>
                  );
                  return disabled ? (
                    <div key={`${role.title}:${role.id}`} className={cardClass}>
                      {inner}
                    </div>
                  ) : (
                    <button type="button" key={`${role.title}:${role.id}`} onClick={() => select("role", role.id)} className={cardClass}>
                      {inner}
                    </button>
                  );
                })
              : filteredCandidates.slice(0, VISIBLE_SUBJECTS).map((cand) => {
                  const active = cand.id === selectedId;
                  return (
                    <button
                      type="button"
                      key={cand.id}
                      onClick={() => select("candidate", cand.id)}
                      className={clsx(
                        "mb-1.5 block w-full rounded border p-2.5 text-left transition hover:shadow-glow",
                        active ? "border-brand-gold bg-brand-sweet/18 dark:bg-brand-sweet/25" : "border-brand-lea/10 hover:border-brand-sweet hover:bg-brand-cloudDancer/55 dark:border-white/10 dark:bg-white/5"
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-brand-lea dark:text-slate-100">{cand.name}</span>
                        {cand.fromArchive ? (
                          <span
                            className="shrink-0 rounded bg-brand-sweet/40 px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand-eden dark:bg-white/10 dark:text-slate-300"
                            title="Historical record from the earlier applicant archive"
                          >
                            arc
                          </span>
                        ) : null}
                        {cand.excluded ? (
                          <AlertTriangle className="h-3 w-3 shrink-0 text-brand-grey dark:text-slate-400" aria-label="Skipped in scans" />
                        ) : null}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-brand-grey dark:text-slate-400">
                        {[cand.title, cand.totalTime ? `${cand.totalTime.toLocaleString()} hr` : null].filter(Boolean).join(" · ") || "No title"}
                      </div>
                    </button>
                  );
                })}
            {mode === "candidate" && filteredCandidates.length > VISIBLE_SUBJECTS ? (
              <p className="p-3 text-xs text-brand-grey dark:text-slate-400">
                Showing {VISIBLE_SUBJECTS} of {filteredCandidates.length.toLocaleString()} — search to narrow it down.
              </p>
            ) : null}
            {((mode === "role" && filteredRoles.length === 0) || (mode === "candidate" && filteredCandidates.length === 0)) ? (
              <p className="p-3 text-sm text-brand-grey dark:text-slate-400">No matches for “{query}”.</p>
            ) : null}
          </div>
        </aside>

        <div className="min-w-0">
          {selectedId && loading ? (
            <section className="flex h-full min-h-[300px] flex-col items-center justify-center rounded bg-white p-8 text-center shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
              <RefreshCw className="h-6 w-6 animate-spin text-brand-sweet" />
              <p className="mt-3 text-sm text-brand-grey dark:text-slate-400">Scoring {mode === "role" ? "candidates" : "roles"}…</p>
            </section>
          ) : mode === "role" ? (
            selectedId && roleData ? (
              <JobScreeningPanel data={roleData} onViewCandidate={(candidateId) => go("candidate", candidateId)} />
            ) : (
              <EmptyState mode={mode} />
            )
          ) : selectedId && candidateData ? (
            <CandidateRoles
              data={candidateData}
              onViewRole={(requirementId) => go("role", requirementId)}
              onViewCandidate={(candidateId) => go("candidate", candidateId)}
            />
          ) : (
            <EmptyState mode={mode} />
          )}
        </div>
      </div>
      )}
    </div>
  );
}

/**
 * GAP 2 — the skipped pool, with a way back.
 *
 * A skip is only safe to make casually if it is visible and reversible; without
 * this list, holding someone out of scans was a one-way door with no inventory.
 * Restoring is the same write as skipping, cleared — no separate undo path to
 * drift out of sync.
 */
function SkippedPoolPanel({ onViewCandidate }: { onViewCandidate: (candidateId: string) => void }) {
  const router = useRouter();
  const [rows, setRows] = useState<SkippedCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [restoring, startRestore] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadSkippedPool()
      .then((res) => {
        if (!live) return;
        if (res.ok && res.data) setRows(res.data);
        else setError(res.error ?? "Could not load the skipped list.");
      })
      .catch(() => live && setError("Could not load the skipped list."));
    return () => {
      live = false;
    };
  }, []);

  function restore(row: SkippedCandidate) {
    setPendingId(row.candidateId);
    setNotice(null);
    startRestore(async () => {
      const res = await setCandidateScanExclusion({ candidateId: row.candidateId, reason: null });
      setPendingId(null);
      if (res.ok) {
        setRows((current) => (current ?? []).filter((entry) => entry.candidateId !== row.candidateId));
        setNotice(`${row.name} is back in the scan pool.`);
        router.refresh();
      } else {
        setNotice(res.error ?? "Could not restore that candidate.");
      }
    });
  }

  const returning = useMemo(() => (rows ?? []).filter((row) => row.reapplied.length > 0), [rows]);

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Skip list</p>
      <h3 className="text-base font-semibold text-brand-lea dark:text-slate-100">Held out of scans</h3>
      <p className="mt-1 max-w-3xl text-xs text-brand-grey dark:text-slate-400">
        Everyone currently kept out of match results, and why. Skipping is never deletion — the record stays, the person
        is simply not suggested. Put anyone back with one click.
      </p>

      {returning.length > 0 ? (
        <div className="mt-3 rounded border border-value-customerFocus-dark/25 bg-value-customerFocus-light/70 p-3 dark:border-amber-400/25 dark:bg-amber-400/10">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-value-customerFocus-dark dark:text-amber-300">
            <History className="h-3.5 w-3.5" /> {returning.length} may have come back
          </p>
          <p className="mt-1 text-xs text-brand-lea dark:text-slate-200">
            These skipped people appear to have a newer, active record — they applied again. Nothing has been excluded
            automatically; open the new record and decide again.
          </p>
        </div>
      ) : null}

      {notice ? (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-element bg-value-leadership-light px-2.5 py-1.5 text-[11px] font-medium text-value-leadership-dark">
          <Lightbulb className="h-3.5 w-3.5 shrink-0" /> {notice}
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-value-customerFocus-dark">{error}</p> : null}

      {rows === null && !error ? (
        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-brand-grey dark:text-slate-400">
          <RefreshCw className="h-4 w-4 animate-spin text-brand-sweet" /> Loading the skip list…
        </div>
      ) : null}

      {rows && rows.length === 0 ? (
        <p className="mt-4 rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-4 text-sm text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
          Nobody is being held out of scans. Everyone in the pool is eligible to surface as a match.
        </p>
      ) : null}

      {rows && rows.length > 0 ? (
        <div className="mt-3 space-y-2">
          {rows.map((row) => (
            <article
              key={row.candidateId}
              className="rounded border border-brand-lea/10 bg-brand-cloudDancer/40 p-3 dark:border-white/10 dark:bg-white/5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onViewCandidate(row.candidateId)}
                      className="text-left font-semibold text-brand-lea transition hover:text-brand-eden dark:text-slate-100"
                    >
                      {row.name}
                    </button>
                    <span className="rounded bg-brand-cloudDancer px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand-grey dark:bg-white/10 dark:text-slate-400">
                      {row.reason ? SCAN_EXCLUSION_LABELS[row.reason] : "Skipped"}
                    </span>
                    {row.standingBar ? (
                      <span className="rounded bg-value-customerFocus-light px-1.5 py-0.5 text-[9px] font-bold uppercase text-value-customerFocus-dark">
                        standing bar
                      </span>
                    ) : null}
                    {row.fromArchive ? (
                      <span className="rounded bg-brand-sweet/40 px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand-eden dark:bg-white/10 dark:text-slate-300">
                        archive
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
                    {[
                      row.currentTitle,
                      row.reasonNote,
                      row.skippedAt ? `skipped ${new Date(row.skippedAt).toLocaleDateString()}` : null,
                      row.skippedBy ? `by ${row.skippedBy}` : null
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No further detail recorded"}
                  </p>
                  {row.reapplied.length > 0 ? (
                    <p className="mt-1.5 text-xs text-value-customerFocus-dark dark:text-amber-300">
                      <History className="mr-1 inline h-3.5 w-3.5" />
                      Looks like they applied again as{" "}
                      {row.reapplied.map((hit, index) => (
                        <span key={hit.candidateId}>
                          {index > 0 ? ", " : ""}
                          <button
                            type="button"
                            onClick={() => onViewCandidate(hit.candidateId)}
                            className="font-semibold underline-offset-2 transition hover:underline"
                          >
                            {hit.name}
                          </button>
                          <span className="opacity-75">
                            {" "}
                            (matched on {hit.matchedOn}
                            {hit.matchedBy === "possible" ? " — worth confirming" : ""})
                          </span>
                        </span>
                      ))}
                      . The new record is being scanned normally.
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    href={`/candidates/${row.candidateId}`}
                    className="inline-flex items-center gap-1.5 rounded-element border border-brand-lea/15 px-2.5 py-1.5 text-xs font-semibold text-brand-eden transition hover:border-brand-sweet hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:bg-white/5"
                  >
                    Profile <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => restore(row)}
                    disabled={restoring && pendingId === row.candidateId}
                    className="inline-flex items-center gap-1.5 rounded-element bg-brand-lea px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    {restoring && pendingId === row.candidateId ? "Restoring…" : "Put back in the pool"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function EmptyState({ mode }: { mode: "role" | "candidate" }) {
  return (
    <section className="flex h-full min-h-[300px] flex-col items-center justify-center rounded bg-white p-8 text-center shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      {mode === "role" ? <Plane className="h-7 w-7 text-brand-sweet" /> : <User className="h-7 w-7 text-brand-sweet" />}
      <h2 className="mt-3 text-lg font-semibold text-brand-lea dark:text-slate-100">
        {mode === "role" ? "Pick a role" : "Pick a candidate"}
      </h2>
      <p className="mt-1 max-w-sm text-sm text-brand-grey dark:text-slate-400">
        {mode === "role"
          ? "Choose a role on the left to see the candidates who qualify, ranked and tagged."
          : "Choose a candidate on the left to see every role that fits them, ranked, with seat-fit flags."}
      </p>
    </section>
  );
}

function CandidateRoles({
  data,
  onViewRole,
  onViewCandidate
}: {
  data: CandidateRoleMatches;
  onViewRole: (requirementId: string) => void;
  onViewCandidate: (candidateId: string) => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState<ScanExclusionReason | "">(data.excludedReason ?? "");
  const [note, setNote] = useState(data.excludedNote ?? "");
  const [saving, startSave] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  // Re-sync when a different candidate is selected (the component is reused).
  useEffect(() => {
    setReason(data.excludedReason ?? "");
    setNote(data.excludedNote ?? "");
    setNotice(null);
  }, [data.candidateId, data.excludedReason, data.excludedNote]);

  function saveExclusion(next: ScanExclusionReason | "", nextNote: string) {
    const previous = reason;
    setReason(next);
    setNotice(null);
    startSave(async () => {
      const res = await setCandidateScanExclusion({
        candidateId: data.candidateId,
        reason: next === "" ? null : next,
        note: nextNote
      });
      if (res.ok) {
        setNotice(
          next === ""
            ? `${data.candidateName} is back in the scan pool.`
            : `${data.candidateName} will be held out of scans — ${SCAN_EXCLUSION_LABELS[next]}. Reversible from the Skipped list.`
        );
        router.refresh();
      } else {
        setReason(previous);
        setNotice(res.error ?? "Could not update candidate.");
      }
    });
  }

  return (
    <section className="flex h-full flex-col overflow-hidden rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Matching roles</p>
          <h3 className="flex items-center gap-2 truncate text-base font-semibold text-brand-lea dark:text-slate-100">
            {data.candidateName}
            {data.fromArchive ? (
              <span
                className="shrink-0 rounded bg-brand-sweet/40 px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand-eden dark:bg-white/10 dark:text-slate-300"
                title="A historical record from the earlier applicant archive"
              >
                archive
              </span>
            ) : null}
          </h3>
          <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
            {[data.currentTitle, data.totalTime ? `${data.totalTime.toLocaleString()} hr total` : null, data.stage]
              .filter(Boolean)
              .join(" · ") || "No flight data on file"}
          </p>
        </div>
        <Link
          href={`/candidates/${data.candidateId}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-element border border-brand-lea/15 px-2.5 py-1.5 text-xs font-semibold text-brand-eden transition hover:border-brand-sweet hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:bg-white/5"
        >
          Full profile <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* GAP 4 — this person was passed on before, under a different record.
          Surfaced only. Nothing is auto-excluded and nothing is auto-merged:
          the decision was made about a moment, and the recruiter gets to make
          it again with the history in front of them. */}
      {data.priorSkips.length > 0 ? (
        <div className="mt-3 rounded border border-value-customerFocus-dark/25 bg-value-customerFocus-light/70 p-3 dark:border-amber-400/25 dark:bg-amber-400/10">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-value-customerFocus-dark dark:text-amber-300">
            <History className="h-3.5 w-3.5" /> Seen before
          </p>
          <p className="mt-1 text-xs text-brand-lea dark:text-slate-200">
            {data.priorSkips.length === 1 ? "An earlier record for" : `${data.priorSkips.length} earlier records for`} what
            looks like this same person {data.priorSkips.length === 1 ? "was" : "were"} skipped. They have not been
            excluded — decide again.
          </p>
          <ul className="mt-2 space-y-1.5">
            {data.priorSkips.map((skip) => (
              <li key={skip.candidateId} className="text-xs text-brand-grey dark:text-slate-300">
                <button
                  type="button"
                  onClick={() => onViewCandidate(skip.candidateId)}
                  className="font-semibold text-brand-eden underline-offset-2 transition hover:underline dark:text-slate-100"
                >
                  {skip.name}
                </button>{" "}
                — {skip.reason ? SCAN_EXCLUSION_LABELS[skip.reason] : "skipped"}
                {skip.reasonNote ? `: ${skip.reasonNote}` : ""}
                {skip.skippedAt ? ` · ${new Date(skip.skippedAt).toLocaleDateString()}` : ""}
                {skip.skippedBy ? ` by ${skip.skippedBy}` : ""}
                <span className="ml-1 opacity-75">
                  (matched on {skip.matchedOn}
                  {skip.matchedBy === "possible" ? " — worth confirming" : ""})
                </span>
                {skip.standingBar ? (
                  <span className="ml-1 font-semibold text-value-customerFocus-dark dark:text-amber-300">
                    Standing bar, not a one-off call.
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* GAP 1 — the skip control, on the Matchboard where the "never show me
          this person again" thought actually happens. */}
      {data.canEdit ? (
        <div className="mt-3 rounded-element border border-brand-lea/10 bg-brand-cloudDancer/30 px-2.5 py-2 dark:border-white/10 dark:bg-white/5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-grey dark:text-slate-400">
              Scan eligibility
            </span>
            <select
              value={reason}
              disabled={saving}
              onChange={(event) => saveExclusion(event.target.value as ScanExclusionReason | "", note)}
              aria-label={`Scan eligibility for ${data.candidateName}`}
              className="rounded-element border border-brand-lea/20 bg-white px-1.5 py-0.5 text-[11px] font-medium text-brand-lea outline-none transition focus:border-brand-gold disabled:opacity-60 dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
            >
              <option value="">In the pool</option>
              {SCAN_EXCLUSION_REASONS.map((entry) => (
                <option key={entry.key} value={entry.key} title={entry.hint}>
                  Skip — {entry.label}
                </option>
              ))}
            </select>
            {reason !== "" ? (
              <input
                value={note}
                disabled={saving}
                onChange={(event) => setNote(event.target.value)}
                onBlur={() => saveExclusion(reason, note)}
                placeholder="Note (optional)"
                className="min-w-0 flex-1 rounded-element border border-brand-lea/20 px-2 py-0.5 text-[11px] outline-none transition focus:border-brand-gold disabled:opacity-60 dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
              />
            ) : null}
          </div>
          {data.excludedReason && data.excludedAt ? (
            <p className="mt-1.5 text-[11px] text-brand-grey dark:text-slate-400">
              Skipped {new Date(data.excludedAt).toLocaleDateString()}
              {data.excludedBy ? ` by ${data.excludedBy}` : ""} — they stay out of scans until you put them back.
            </p>
          ) : null}
          {notice ? (
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-value-leadership-dark dark:text-amber-300">
              <Lightbulb className="h-3.5 w-3.5 shrink-0" /> {notice}
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="mt-2 text-xs text-brand-grey dark:text-slate-400">
        {data.roles.length} role{data.roles.length === 1 ? "" : "s"} this candidate qualifies for, best fit first.
        Overqualified first-officer seats are flagged.
      </p>

      <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {data.roles.length > 0 ? (
          data.roles.map((role) => (
            <RoleMatchCard key={role.requirementId} role={role} onViewCandidates={onViewRole} />
          ))
        ) : (
          <p className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-4 text-sm text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
            No matching roles yet. Add candidate flight data or create pilot requirements, then check back.
          </p>
        )}
      </div>
    </section>
  );
}
