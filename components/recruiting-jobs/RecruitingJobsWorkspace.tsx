"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import type { RecruitingJobDetail, RecruitingJobsData } from "@/lib/data/recruiting-jobs";
import { JobClassificationEditor } from "@/components/recruiting-jobs/JobClassificationEditor";
import { JobListsPanel } from "@/components/recruiting-jobs/JobListsPanel";
import { EditableGrid, type EditablePanel, type GridItem } from "@/components/shared/EditableGrid";
import { AddCandidateToJob } from "@/components/recruiting-jobs/AddCandidateToJob";
import { NewJobButton } from "@/components/recruiting-jobs/NewJobButton";
import { PaycomReqField } from "@/components/recruiting-jobs/PaycomReqField";
import { JobActiveToggle } from "@/components/recruiting-jobs/JobActiveToggle";
import { ResumeIntake } from "@/components/candidates/ResumeIntake";
import { DocumentIntake } from "@/components/candidates/DocumentIntake";
import type { WidgetInstance } from "@/lib/data/page-layout";
import type { WidgetData } from "@/components/widgets/registry";

type RecruitingJobsWorkspaceProps = {
  data: RecruitingJobsData;
  query: string;
  canEdit?: boolean;
  savedLayout?: GridItem[] | null;
  savedWidgets?: WidgetInstance[] | null;
  widgetData?: WidgetData;
};

const statLabels: Array<[keyof RecruitingJobsData["stats"], string]> = [
  ["total", "Imported roles"],
  ["open", "Open"],
  ["pilot", "Pilot"],
  ["support", "Support"],
  ["withCandidates", "With candidates"]
];

// Default arrangement (12-col grid) used until an admin saves a custom layout.
const JOBS_DEFAULT_LAYOUT: GridItem[] = [
  { i: "rjobs-header", x: 0, y: 0, w: 5, h: 5 },
  { i: "rjobs-stats", x: 5, y: 0, w: 7, h: 5 },
  { i: "rjobs-jobs-list", x: 0, y: 5, w: 6, h: 16 },
  { i: "rjobs-detail-header", x: 6, y: 5, w: 6, h: 6 },
  { i: "rjobs-linked-cands", x: 6, y: 11, w: 3, h: 7 },
  { i: "rjobs-linked-reqs", x: 9, y: 11, w: 3, h: 7 },
  { i: "rjobs-source", x: 6, y: 18, w: 6, h: 3 }
];

function locationLabel(job: { city: string | null; state: string | null }) {
  return [job.city, job.state].filter(Boolean).join(", ") || "No base";
}

function HeaderPanel({ query, canEdit }: { query: string; canEdit?: boolean }) {
  return (
    <section className="flex h-full flex-col rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Role operations</p>
      <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Jobs</h1>
      <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
        Role records, linked pilot requirements, and candidate coverage. Publishing workflows remain in Job Builder.
      </p>
      <form className="mt-3 flex w-full gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search title, department, aircraft, base, status"
          className="min-w-0 flex-1 rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-black outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
        />
        <Button type="submit">Search</Button>
      </form>
      {canEdit && <NewJobButton />}
    </section>
  );
}

function StatsPanel({ stats }: { stats: RecruitingJobsData["stats"] }) {
  return (
    <section className="grid h-full content-start grid-cols-[repeat(auto-fit,minmax(108px,1fr))] gap-3">
      {statLabels.map(([key, label]) => (
        <div key={key} className="rounded bg-white p-3 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">{label}</div>
          <div className="mt-1 text-xl font-semibold text-brand-lea dark:text-slate-100">{stats[key]}</div>
          <div className="mt-2 h-1 rounded-full bg-brand-gold/25">
            <div className="h-1 w-2/3 rounded-full bg-brand-sweet" />
          </div>
        </div>
      ))}
    </section>
  );
}

function JobDetailHeader({ job, canEdit }: { job: RecruitingJobDetail; canEdit?: boolean }) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-y-auto rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Job detail</p>
          <h2 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">{job.title}</h2>
          <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
            {[job.department, locationLabel(job)].filter(Boolean).join(" - ")}
          </p>
          <JobActiveToggle key={`active-${job.id}`} jobId={job.id} status={job.status} canEdit={canEdit} />
          <JobClassificationEditor
            key={job.id}
            jobId={job.id}
            isPilotRole={job.isPilotRole}
            pilotSeat={job.pilotSeat}
            aircraftTypes={job.aircraftTypes}
          />
          <PaycomReqField key={`paycom-${job.id}`} jobId={job.id} paycomReqId={job.paycomReqId} canEdit={canEdit} />
        </div>
        <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-2 text-sm">
          <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/55 p-3 dark:border-white/10 dark:bg-white/5">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Candidates</div>
            <div className="mt-1 text-lg font-semibold text-brand-lea dark:text-slate-100">{job.candidateCount}</div>
          </div>
          <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/55 p-3 dark:border-white/10 dark:bg-white/5">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Requirements</div>
            <div className="mt-1 text-lg font-semibold text-brand-lea dark:text-slate-100">{job.requirementCount}</div>
          </div>
          <div className="col-[1/-1] rounded border border-brand-lea/10 bg-brand-cloudDancer/55 p-3 dark:border-white/10 dark:bg-white/5">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">Pay</div>
            <div className="mt-1 break-words text-sm font-semibold text-brand-lea dark:text-slate-100">
              {job.paySummary ?? job.rawPayScale ?? "No pay recorded"}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function LinkedRequirements({ job }: { job: RecruitingJobDetail }) {
  return (
    <section className="flex h-full flex-col overflow-hidden rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Linked requirements</p>
      <h3 className="text-base font-semibold text-brand-lea dark:text-slate-100">Pilot requirement profiles</h3>
      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
        {job.linkedRequirements.length > 0 ? (
          job.linkedRequirements.map((requirement) => (
            <Link
              key={requirement.id}
              href={`/pilot-requirements?id=${requirement.id}`}
              className="block rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 transition hover:border-brand-sweet hover:bg-brand-sweet/18 hover:shadow-glow dark:border-white/10 dark:bg-white/5"
            >
              <div className="font-semibold text-brand-lea dark:text-slate-100">{requirement.title}</div>
              <div className="mt-1 text-xs text-brand-grey dark:text-slate-400">
                {[requirement.pilotSeat, requirement.status, requirement.reviewStatus].filter(Boolean).join(" - ")}
              </div>
            </Link>
          ))
        ) : (
          <p className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 text-sm text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
            No linked requirement profile yet.
          </p>
        )}
      </div>
    </section>
  );
}

function LinkedCandidates({ job }: { job: RecruitingJobDetail }) {
  return (
    <section className="flex h-full flex-col overflow-hidden rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Linked candidates</p>
          <h3 className="text-base font-semibold text-brand-lea dark:text-slate-100">Applied or associated candidates</h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <ResumeIntake jobId={job.id} jobTitle={job.title} />
          <DocumentIntake jobId={job.id} />
          <AddCandidateToJob jobId={job.id} jobTitle={job.title} />
        </div>
      </div>
      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
        {job.linkedCandidates.length > 0 ? (
          job.linkedCandidates.map((candidate) => (
            <Link
              key={candidate.id}
              href={`/candidates?q=${encodeURIComponent(candidate.displayName)}`}
              className="block rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 transition hover:border-brand-sweet hover:bg-brand-sweet/18 hover:shadow-glow dark:border-white/10 dark:bg-white/5"
            >
              <div className="font-semibold text-brand-lea dark:text-slate-100">{candidate.displayName}</div>
              <div className="mt-1 text-xs text-brand-grey dark:text-slate-400">
                {[candidate.currentTitle, candidate.stage, candidate.status].filter(Boolean).join(" - ")}
              </div>
            </Link>
          ))
        ) : (
          <p className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 text-sm text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
            No linked candidates yet. Suggested candidates will be added after matching logic exists.
          </p>
        )}
      </div>
    </section>
  );
}

function SourceRecord({ job }: { job: RecruitingJobDetail }) {
  const sourceText = job.rawMinimumRequirements || job.jobDescriptionText;
  return (
    <section className="flex h-full flex-col overflow-hidden rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Source record</p>
      <h3 className="text-base font-semibold text-brand-lea dark:text-slate-100">Imported job text</h3>
      <div className="mt-2 grid gap-2 text-xs text-brand-grey grid-cols-[repeat(auto-fit,minmax(140px,1fr))] dark:text-slate-400">
        <div>Req ID: {job.jobReqId ?? "Not recorded"}</div>
        <div>Recruiter: {job.recruiter ?? "Not recorded"}</div>
        <div>Source: {job.sourceFilename ?? "Not recorded"}</div>
      </div>
      {sourceText ? (
        <div className="mt-3 min-h-0 flex-1 overflow-auto rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-4 text-sm leading-6 text-brand-black/78 dark:text-slate-300 whitespace-pre-wrap dark:border-white/10 dark:bg-white/5">
          {sourceText}
        </div>
      ) : (
        <p className="mt-3 text-sm text-brand-grey dark:text-slate-400">No source text is attached to this job yet.</p>
      )}
    </section>
  );
}

function NoJobPanel() {
  return (
    <section className="flex h-full flex-col items-center justify-center rounded bg-white p-8 text-center shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">No jobs yet</h2>
      <p className="mt-2 text-sm text-brand-grey dark:text-slate-400">Import or seed recruiting jobs to populate this workspace.</p>
    </section>
  );
}

// Placeholder so the three detail panels are ALWAYS present (stable panel set) —
// shown only in the edge case where nothing is selected.
function EmptyDetail({ title }: { title: string }) {
  return (
    <section className="flex h-full flex-col items-center justify-center rounded bg-white p-6 text-center shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">{title}</p>
      <p className="mt-2 text-sm text-brand-grey dark:text-slate-400">Select a job to see its details.</p>
    </section>
  );
}

export function RecruitingJobsWorkspace({ data, query, canEdit = false, savedLayout = null, savedWidgets = null, widgetData }: RecruitingJobsWorkspaceProps) {
  const pilotJobs = useMemo(() => data.jobs.filter((j) => j.isPilotRole), [data.jobs]);
  const supportJobs = useMemo(() => data.jobs.filter((j) => !j.isPilotRole), [data.jobs]);
  const [selectedId, setSelectedId] = useState<string | null>(data.selectedJob?.id ?? null);
  const job = selectedId ? data.details[selectedId] ?? null : null;

  // Keep ?id= in the URL (no navigation) so a refresh keeps the selection.
  useEffect(() => {
    if (!selectedId || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("id", selectedId);
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url.toString());
  }, [selectedId, query]);

  // ALWAYS the same 7 panels (detail panels show a placeholder when nothing is
  // selected) AND a stable array reference via useMemo. EditableGrid re-runs its
  // layout init whenever the panels reference or the set of panel ids changes; a
  // changing set (conditional detail panels) or a fresh reference every render
  // made the grid collapse the panels on top of each other.
  const panels: EditablePanel[] = useMemo(
    () => [
      { id: "rjobs-header", title: "Role operations", node: <HeaderPanel query={query} canEdit={canEdit} /> },
      { id: "rjobs-stats", title: "Job statistics", node: <StatsPanel stats={data.stats} /> },
      {
        id: "rjobs-jobs-list",
        title: "Pilot & support jobs",
        node: <JobListsPanel pilotJobs={pilotJobs} supportJobs={supportJobs} selectedId={selectedId} onSelect={setSelectedId} />
      },
      { id: "rjobs-detail-header", title: "Job detail", node: job ? <JobDetailHeader job={job} canEdit={canEdit} /> : <NoJobPanel /> },
      { id: "rjobs-linked-cands", title: "Linked candidates", node: job ? <LinkedCandidates job={job} /> : <EmptyDetail title="Linked candidates" /> },
      { id: "rjobs-linked-reqs", title: "Linked requirements", node: job ? <LinkedRequirements job={job} /> : <EmptyDetail title="Linked requirements" /> },
      { id: "rjobs-source", title: "Source record", node: job ? <SourceRecord job={job} /> : <EmptyDetail title="Source record" /> }
    ],
    [job, selectedId, query, pilotJobs, supportJobs, data.stats, canEdit]
  );

  return (
    <div className="px-5 py-5 lg:px-8">
      <EditableGrid
        pageKey="recruiting-jobs"
        panels={panels}
        defaultLayout={JOBS_DEFAULT_LAYOUT}
        savedLayout={savedLayout}
        savedWidgets={savedWidgets}
        canEdit={canEdit}
        widgetData={widgetData}
      />
    </div>
  );
}
