"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Plane, Wrench } from "lucide-react";
import type { RecruitingJobsData } from "@/lib/data/recruiting-jobs";

type Job = RecruitingJobsData["jobs"][number];

function locationLabel(job: { city: string | null; state: string | null }) {
  return [job.city, job.state].filter(Boolean).join(", ") || "No base";
}

function JobCard({ job, selectedId, query }: { job: Job; selectedId: string | null; query: string }) {
  const isSelected = job.id === selectedId;
  return (
    <Link
      href={`/recruiting-jobs?id=${job.id}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
      className={`block rounded border p-3 transition hover:shadow-glow ${
        isSelected
          ? "border-brand-gold bg-brand-sweet/18 dark:bg-brand-sweet/25"
          : "border-brand-lea/10 bg-white hover:border-brand-sweet hover:bg-brand-cloudDancer/65 dark:border-white/10 dark:bg-[#10243a] dark:bg-white/5"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="break-words text-sm font-semibold text-brand-lea dark:text-slate-100">{job.title}</div>
          <div className="mt-1 text-xs text-brand-grey dark:text-slate-400">
            {[job.department, job.status, locationLabel(job)].filter(Boolean).join(" - ")}
          </div>
        </div>
        <span className="shrink-0 rounded border border-brand-sweet/50 bg-brand-sweet/20 px-2 py-0.5 text-[10px] font-bold text-brand-lea dark:text-slate-100">
          {job.isPilotRole ? "Pilot" : "Support"}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/60 p-2 dark:border-white/10 dark:bg-white/5">
          <div className="text-[9px] font-bold uppercase text-brand-grey dark:text-slate-400">Candidates</div>
          <div className="text-sm font-semibold text-brand-lea dark:text-slate-100">{job.candidateCount}</div>
        </div>
        <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/60 p-2 dark:border-white/10 dark:bg-white/5">
          <div className="text-[9px] font-bold uppercase text-brand-grey dark:text-slate-400">Req profiles</div>
          <div className="text-sm font-semibold text-brand-lea dark:text-slate-100">{job.requirementCount}</div>
        </div>
      </div>
    </Link>
  );
}

function CollapsibleList({
  title,
  Icon,
  jobs,
  selectedId,
  query,
  emptyText,
  open,
  onToggle
}: {
  title: string;
  Icon: typeof Plane;
  jobs: Job[];
  selectedId: string | null;
  query: string;
  emptyText: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden rounded border border-brand-lea/10 bg-white transition-[flex] dark:border-white/10 dark:bg-[#10243a] ${
        open ? "flex-1" : "flex-none"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex shrink-0 items-center justify-between gap-2 px-4 py-3 text-left transition hover:bg-brand-cloudDancer/45 dark:bg-white/5"
      >
        <span className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-brand-gold" />
          <span className="text-base font-semibold text-brand-lea dark:text-slate-100">{title}</span>
          <span className="text-xs text-brand-grey dark:text-slate-400">({jobs.length})</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 text-brand-grey transition-transform dark:text-slate-400 ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open ? (
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-brand-lea/10 p-3 dark:border-white/10">
          {jobs.length > 0 ? (
            <div className="space-y-2">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} selectedId={selectedId} query={query} />
              ))}
            </div>
          ) : (
            <p className="p-2 text-sm text-brand-grey dark:text-slate-400">{emptyText}</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

export function JobListsPanel({
  pilotJobs,
  supportJobs,
  selectedId,
  query
}: {
  pilotJobs: Job[];
  supportJobs: Job[];
  selectedId: string | null;
  query: string;
}) {
  const [openPilot, setOpenPilot] = useState(true);
  const [openSupport, setOpenSupport] = useState(true);

  // Never let both collapse — keep at least one open so the panel isn't empty.
  function toggle(which: "pilot" | "support") {
    if (which === "pilot") {
      if (openPilot && !openSupport) return setOpenSupport(true);
      setOpenPilot((v) => !v);
    } else {
      if (openSupport && !openPilot) return setOpenPilot(true);
      setOpenSupport((v) => !v);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <CollapsibleList
        title="Pilot jobs"
        Icon={Plane}
        jobs={pilotJobs}
        selectedId={selectedId}
        query={query}
        emptyText="No pilot jobs match the current search."
        open={openPilot}
        onToggle={() => toggle("pilot")}
      />
      <CollapsibleList
        title="Support jobs"
        Icon={Wrench}
        jobs={supportJobs}
        selectedId={selectedId}
        query={query}
        emptyText="No support jobs match the current search."
        open={openSupport}
        onToggle={() => toggle("support")}
      />
    </div>
  );
}
