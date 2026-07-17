"use client";

import { useState } from "react";
import { ChevronDown, Plane, Wrench } from "lucide-react";
import type { RecruitingJobsData } from "@/lib/data/recruiting-jobs";

type Job = RecruitingJobsData["jobs"][number];

function locationLabel(job: { city: string | null; state: string | null }) {
  return [job.city, job.state].filter(Boolean).join(", ") || "No base";
}

function JobCard({ job, selectedId, onSelect }: { job: Job; selectedId: string | null; onSelect: (id: string) => void }) {
  const isSelected = job.id === selectedId;
  return (
    <button
      type="button"
      onClick={() => onSelect(job.id)}
      className={`block w-full text-left rounded border p-3 transition hover:shadow-glow ${
        isSelected
          ? "border-brand-gold bg-brand-sweet/18 dark:bg-brand-sweet/25"
          : "border-brand-lea/10 bg-white hover:border-brand-sweet hover:bg-brand-cloudDancer/65 dark:border-white/10 dark:bg-brand-panel"
      } ${job.isActive ? "" : "opacity-60"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="break-words text-sm font-semibold text-brand-lea dark:text-slate-100">{job.title}</div>
          <div className="mt-1 text-xs text-brand-grey dark:text-slate-400">
            {[job.department, locationLabel(job)].filter(Boolean).join(" - ")}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={`rounded px-2 py-0.5 text-[10px] font-bold ${
              job.isActive
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                : "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400"
            }`}
          >
            {job.isActive ? "Active" : "Inactive"}
          </span>
          <span className="rounded border border-brand-sweet/50 bg-brand-sweet/20 px-2 py-0.5 text-[10px] font-bold text-brand-lea dark:text-slate-100">
            {job.isPilotRole ? "Pilot" : "Support"}
          </span>
        </div>
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
    </button>
  );
}

function CollapsibleList({
  title,
  Icon,
  jobs,
  selectedId,
  onSelect,
  emptyText,
  open,
  onToggle
}: {
  title: string;
  Icon: typeof Plane;
  jobs: Job[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  emptyText: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden rounded border border-brand-lea/10 bg-white transition-[flex] dark:border-white/10 dark:bg-brand-panel ${
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
                <JobCard key={job.id} job={job} selectedId={selectedId} onSelect={onSelect} />
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
  onSelect
}: {
  pilotJobs: Job[];
  supportJobs: Job[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [openPilot, setOpenPilot] = useState(true);
  const [openSupport, setOpenSupport] = useState(true);
  // Off by default so nothing vanishes unexpectedly; on when you want to focus
  // only on the roles you are actively hiring for.
  const [hideInactive, setHideInactive] = useState(false);

  const filteredPilot = hideInactive ? pilotJobs.filter((j) => j.isActive) : pilotJobs;
  const filteredSupport = hideInactive ? supportJobs.filter((j) => j.isActive) : supportJobs;
  const inactiveCount = pilotJobs.filter((j) => !j.isActive).length + supportJobs.filter((j) => !j.isActive).length;

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
      {inactiveCount > 0 && (
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-brand-grey dark:text-slate-400">
          <input
            type="checkbox"
            checked={hideInactive}
            onChange={(e) => setHideInactive(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-brand-lea/30 accent-brand-lea"
          />
          Hide inactive ({inactiveCount})
        </label>
      )}
      <CollapsibleList
        title="Pilot jobs"
        Icon={Plane}
        jobs={filteredPilot}
        selectedId={selectedId}
        onSelect={onSelect}
        emptyText="No pilot jobs match the current search."
        open={openPilot}
        onToggle={() => toggle("pilot")}
      />
      <CollapsibleList
        title="Support jobs"
        Icon={Wrench}
        jobs={filteredSupport}
        selectedId={selectedId}
        onSelect={onSelect}
        emptyText="No support jobs match the current search."
        open={openSupport}
        onToggle={() => toggle("support")}
      />
    </div>
  );
}
