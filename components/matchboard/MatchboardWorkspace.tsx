"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Search, Plane, User, Radar, ExternalLink, AlertTriangle } from "lucide-react";
import { JobScreeningPanel } from "@/components/recruiting-jobs/JobScreeningPanel";
import { RoleMatchCard } from "@/components/matchboard/RoleMatchCard";
import type { MatchboardSubjects, CandidateRoleMatches } from "@/lib/matching/matchboard";
import type { JobScreeningData } from "@/lib/data/job-screening";

export type MatchboardMode = "role" | "candidate";

function seatTag(seat: string | null) {
  const s = (seat ?? "").toLowerCase();
  if (s === "pic") return { label: "PIC", cls: "bg-value-teamwork-light text-value-teamwork-dark" };
  if (s === "sic") return { label: "SIC", cls: "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400" };
  return { label: seat || "Support", cls: "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400" };
}

export function MatchboardWorkspace({
  subjects,
  mode,
  selectedId,
  roleData,
  candidateData
}: {
  subjects: MatchboardSubjects;
  mode: MatchboardMode;
  selectedId: string | null;
  roleData: JobScreeningData | null;
  candidateData: CandidateRoleMatches | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function go(nextMode: MatchboardMode, id?: string) {
    const params = new URLSearchParams();
    params.set("mode", nextMode);
    if (id) params.set("id", id);
    router.push(`/matching?${params.toString()}`);
  }

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
      <section className="mb-4 rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
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
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex max-h-[78vh] flex-col overflow-hidden rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
          <div className="shrink-0 border-b border-brand-lea/10 p-3 dark:border-white/10">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-grey dark:text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={mode === "role" ? "Search roles" : "Search candidates"}
                className="w-full rounded border border-brand-lea/20 bg-white py-2 pl-8 pr-3 text-sm text-brand-black outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 dark:border-white/10 dark:bg-[#10243a] dark:text-slate-100"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {mode === "role"
              ? filteredRoles.map((role) => {
                  const seat = seatTag(role.seat);
                  const active = role.id !== "" && role.id === selectedId;
                  const disabled = role.noProfile;
                  return (
                    <button
                      key={`${role.title}:${role.id}`}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        if (!disabled) go("role", role.id);
                      }}
                      className={clsx(
                        "mb-1.5 block w-full rounded border p-2.5 text-left transition hover:shadow-glow",
                        disabled
                          ? "cursor-default border-brand-lea/10 opacity-60 dark:border-white/10"
                          : active
                            ? "border-brand-gold bg-brand-sweet/18 dark:bg-brand-sweet/25"
                            : "border-brand-lea/10 hover:border-brand-sweet hover:bg-brand-cloudDancer/55 dark:border-white/10 dark:bg-white/5"
                      )}
                    >
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
                    </button>
                  );
                })
              : filteredCandidates.map((cand) => {
                  const active = cand.id === selectedId;
                  return (
                    <button
                      key={cand.id}
                      type="button"
                      onClick={() => go("candidate", cand.id)}
                      className={clsx(
                        "mb-1.5 block w-full rounded border p-2.5 text-left transition hover:shadow-glow",
                        active ? "border-brand-gold bg-brand-sweet/18 dark:bg-brand-sweet/25" : "border-brand-lea/10 hover:border-brand-sweet hover:bg-brand-cloudDancer/55 dark:border-white/10 dark:bg-white/5"
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-brand-lea dark:text-slate-100">{cand.name}</span>
                        {cand.excluded ? <AlertTriangle className="h-3 w-3 shrink-0 text-brand-grey dark:text-slate-400" /> : null}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-brand-grey dark:text-slate-400">
                        {[cand.title, cand.totalTime ? `${cand.totalTime.toLocaleString()} hr` : null].filter(Boolean).join(" · ") || "No title"}
                      </div>
                    </button>
                  );
                })}
            {((mode === "role" && filteredRoles.length === 0) || (mode === "candidate" && filteredCandidates.length === 0)) ? (
              <p className="p-3 text-sm text-brand-grey dark:text-slate-400">No matches for “{query}”.</p>
            ) : null}
          </div>
        </aside>

        <div className="min-w-0">
          {mode === "role" ? (
            selectedId && roleData ? (
              <JobScreeningPanel data={roleData} onViewCandidate={(candidateId) => go("candidate", candidateId)} />
            ) : (
              <EmptyState mode={mode} />
            )
          ) : selectedId && candidateData ? (
            <CandidateRoles data={candidateData} onViewRole={(requirementId) => go("role", requirementId)} />
          ) : (
            <EmptyState mode={mode} />
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ mode }: { mode: MatchboardMode }) {
  return (
    <section className="flex h-full min-h-[300px] flex-col items-center justify-center rounded bg-white p-8 text-center shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
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
  onViewRole
}: {
  data: CandidateRoleMatches;
  onViewRole: (requirementId: string) => void;
}) {
  return (
    <section className="flex h-full flex-col overflow-hidden rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Matching roles</p>
          <h3 className="truncate text-base font-semibold text-brand-lea dark:text-slate-100">{data.candidateName}</h3>
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
