import Link from "next/link";
import type { RecruitingJobDetail, RecruitingJobsData } from "@/lib/data/recruiting-jobs";
import { JobClassificationEditor } from "@/components/recruiting-jobs/JobClassificationEditor";
import { EditableGrid, type EditablePanel, type GridItem } from "@/components/shared/EditableGrid";
import { AddCandidateToJob } from "@/components/recruiting-jobs/AddCandidateToJob";
import type { WidgetInstance } from "@/lib/data/page-layout";

type RecruitingJobsWorkspaceProps = {
  data: RecruitingJobsData;
  query: string;
  canEdit?: boolean;
  savedLayout?: GridItem[] | null;
  savedWidgets?: WidgetInstance[] | null;
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
  { i: "rjobs-pilot-list", x: 0, y: 5, w: 3, h: 16 },
  { i: "rjobs-support-list", x: 3, y: 5, w: 3, h: 16 },
  { i: "rjobs-detail-header", x: 6, y: 5, w: 6, h: 6 },
  { i: "rjobs-linked-cands", x: 6, y: 11, w: 3, h: 7 },
  { i: "rjobs-linked-reqs", x: 9, y: 11, w: 3, h: 7 },
  { i: "rjobs-source", x: 6, y: 18, w: 6, h: 3 }
];

function locationLabel(job: { city: string | null; state: string | null }) {
  return [job.city, job.state].filter(Boolean).join(", ") || "No base";
}

function HeaderPanel({ query }: { query: string }) {
  return (
    <section className="flex h-full flex-col rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
      <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Role operations</p>
      <h1 className="text-2xl font-semibold text-brand-lea">Jobs</h1>
      <p className="mt-1 text-sm text-brand-grey">
        Imported role records, linked pilot requirements, and candidate coverage. Publishing workflows remain in Job Builder.
      </p>
      <form className="mt-3 flex w-full gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search title, department, aircraft, base, status"
          className="min-w-0 flex-1 rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-black outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20"
        />
        <button type="submit" className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden">
          Search
        </button>
      </form>
    </section>
  );
}

function StatsPanel({ stats }: { stats: RecruitingJobsData["stats"] }) {
  return (
    <section className="grid h-full grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      {statLabels.map(([key, label]) => (
        <div key={key} className="rounded bg-white p-3 shadow-panel ring-1 ring-brand-lea/10">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-grey">{label}</div>
          <div className="mt-1 text-xl font-semibold text-brand-lea">{stats[key]}</div>
          <div className="mt-2 h-1 rounded-full bg-brand-gold/25">
            <div className="h-1 w-2/3 rounded-full bg-brand-sweet" />
          </div>
        </div>
      ))}
    </section>
  );
}

function JobCard({
  job,
  selectedId,
  query
}: {
  job: RecruitingJobsData["jobs"][number];
  selectedId: string | null;
  query: string;
}) {
  const isSelected = job.id === selectedId;

  return (
    <Link
      href={`/recruiting-jobs?id=${job.id}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
      className={`block rounded border p-3 transition ${
        isSelected
          ? "border-brand-gold bg-brand-sweet/18"
          : "border-brand-lea/10 bg-white hover:border-brand-sweet hover:bg-brand-cloudDancer/65"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-brand-lea">{job.title}</div>
          <div className="mt-1 text-xs text-brand-grey">
            {[job.department, job.status, locationLabel(job)].filter(Boolean).join(" - ")}
          </div>
        </div>
        <span className="rounded-full border border-brand-sweet/50 bg-brand-sweet/20 px-2 py-0.5 text-[10px] font-bold text-brand-lea">
          {job.isPilotRole ? "Pilot" : "Support"}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/60 p-2">
          <div className="text-[9px] font-bold uppercase text-brand-grey">Candidates</div>
          <div className="text-sm font-semibold text-brand-lea">{job.candidateCount}</div>
        </div>
        <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/60 p-2">
          <div className="text-[9px] font-bold uppercase text-brand-grey">Req profiles</div>
          <div className="text-sm font-semibold text-brand-lea">{job.requirementCount}</div>
        </div>
      </div>
    </Link>
  );
}

function JobList({
  title,
  jobs,
  selectedId,
  query,
  emptyText
}: {
  title: string;
  jobs: RecruitingJobsData["jobs"];
  selectedId: string | null;
  query: string;
  emptyText: string;
}) {
  return (
    <section className="flex h-full flex-col rounded bg-white shadow-panel ring-1 ring-brand-lea/10">
      <div className="shrink-0 border-b border-brand-lea/10 px-4 py-3">
        <h2 className="text-base font-semibold text-brand-lea">{title}</h2>
        <p className="text-xs text-brand-grey">{jobs.length} shown</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {jobs.length > 0 ? (
          <div className="space-y-2">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} selectedId={selectedId} query={query} />
            ))}
          </div>
        ) : (
          <p className="p-4 text-sm text-brand-grey">{emptyText}</p>
        )}
      </div>
    </section>
  );
}

function JobDetailHeader({ job }: { job: RecruitingJobDetail }) {
  return (
    <section className="flex h-full flex-col rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Job detail</p>
          <h2 className="text-2xl font-semibold text-brand-lea">{job.title}</h2>
          <p className="mt-1 text-sm text-brand-grey">
            {[job.department, job.status, locationLabel(job)].filter(Boolean).join(" - ")}
          </p>
          <JobClassificationEditor
            key={job.id}
            jobId={job.id}
            isPilotRole={job.isPilotRole}
            pilotSeat={job.pilotSeat}
            aircraftTypes={job.aircraftTypes}
          />
        </div>
        <div className="grid w-full grid-cols-2 gap-2 text-sm 2xl:max-w-[360px]">
          <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/55 p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">Candidates</div>
            <div className="mt-1 text-lg font-semibold text-brand-lea">{job.candidateCount}</div>
          </div>
          <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/55 p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">Requirements</div>
            <div className="mt-1 text-lg font-semibold text-brand-lea">{job.requirementCount}</div>
          </div>
          <div className="col-span-2 rounded border border-brand-lea/10 bg-brand-cloudDancer/55 p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">Pay</div>
            <div className="mt-1 truncate text-sm font-semibold text-brand-lea">
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
    <section className="flex h-full flex-col overflow-hidden rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Linked requirements</p>
      <h3 className="text-base font-semibold text-brand-lea">Pilot requirement profiles</h3>
      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
        {job.linkedRequirements.length > 0 ? (
          job.linkedRequirements.map((requirement) => (
            <Link
              key={requirement.id}
              href={`/pilot-requirements?id=${requirement.id}`}
              className="block rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 transition hover:border-brand-sweet hover:bg-brand-sweet/18"
            >
              <div className="font-semibold text-brand-lea">{requirement.title}</div>
              <div className="mt-1 text-xs text-brand-grey">
                {[requirement.pilotSeat, requirement.status, requirement.reviewStatus].filter(Boolean).join(" - ")}
              </div>
            </Link>
          ))
        ) : (
          <p className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 text-sm text-brand-grey">
            No linked requirement profile yet.
          </p>
        )}
      </div>
    </section>
  );
}

function LinkedCandidates({ job }: { job: RecruitingJobDetail }) {
  return (
    <section className="flex h-full flex-col overflow-hidden rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Linked candidates</p>
          <h3 className="text-base font-semibold text-brand-lea">Applied or associated candidates</h3>
        </div>
        <AddCandidateToJob jobId={job.id} jobTitle={job.title} />
      </div>
      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
        {job.linkedCandidates.length > 0 ? (
          job.linkedCandidates.map((candidate) => (
            <Link
              key={candidate.id}
              href={`/candidates?q=${encodeURIComponent(candidate.displayName)}`}
              className="block rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 transition hover:border-brand-sweet hover:bg-brand-sweet/18"
            >
              <div className="font-semibold text-brand-lea">{candidate.displayName}</div>
              <div className="mt-1 text-xs text-brand-grey">
                {[candidate.currentTitle, candidate.stage, candidate.status].filter(Boolean).join(" - ")}
              </div>
            </Link>
          ))
        ) : (
          <p className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 text-sm text-brand-grey">
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
    <section className="flex h-full flex-col overflow-hidden rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Source record</p>
      <h3 className="text-base font-semibold text-brand-lea">Imported job text</h3>
      <div className="mt-2 grid gap-2 text-xs text-brand-grey sm:grid-cols-3">
        <div>Req ID: {job.jobReqId ?? "Not recorded"}</div>
        <div>Recruiter: {job.recruiter ?? "Not recorded"}</div>
        <div>Source: {job.sourceFilename ?? "Not recorded"}</div>
      </div>
      {sourceText ? (
        <div className="mt-3 min-h-0 flex-1 overflow-auto rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-4 text-sm leading-6 text-brand-black/78 whitespace-pre-wrap">
          {sourceText}
        </div>
      ) : (
        <p className="mt-3 text-sm text-brand-grey">No source text is attached to this job yet.</p>
      )}
    </section>
  );
}

function NoJobPanel() {
  return (
    <section className="flex h-full flex-col items-center justify-center rounded bg-white p-8 text-center shadow-panel ring-1 ring-brand-lea/10">
      <h2 className="text-lg font-semibold text-brand-lea">No jobs yet</h2>
      <p className="mt-2 text-sm text-brand-grey">Import or seed recruiting jobs to populate this workspace.</p>
    </section>
  );
}

export function RecruitingJobsWorkspace({ data, query, canEdit = false, savedLayout = null, savedWidgets = null }: RecruitingJobsWorkspaceProps) {
  const pilotJobs = data.jobs.filter((job) => job.isPilotRole);
  const supportJobs = data.jobs.filter((job) => !job.isPilotRole);
  const selectedId = data.selectedJob?.id ?? null;
  const job = data.selectedJob;

  const panels: EditablePanel[] = [
    { id: "rjobs-header", title: "Role operations", node: <HeaderPanel query={query} /> },
    { id: "rjobs-stats", title: "Job statistics", node: <StatsPanel stats={data.stats} /> },
    {
      id: "rjobs-pilot-list",
      title: "Pilot jobs",
      node: <JobList title="Pilot jobs" jobs={pilotJobs} selectedId={selectedId} query={query} emptyText="No pilot jobs match the current search." />
    },
    {
      id: "rjobs-support-list",
      title: "Support jobs",
      node: <JobList title="Support jobs" jobs={supportJobs} selectedId={selectedId} query={query} emptyText="No support jobs match the current search." />
    },
    {
      id: "rjobs-detail-header",
      title: "Job detail",
      node: job ? <JobDetailHeader job={job} /> : <NoJobPanel />
    }
  ];

  if (job) {
    panels.push(
      { id: "rjobs-linked-cands", title: "Linked candidates", node: <LinkedCandidates job={job} /> },
      { id: "rjobs-linked-reqs", title: "Linked requirements", node: <LinkedRequirements job={job} /> },
      { id: "rjobs-source", title: "Source record", node: <SourceRecord job={job} /> }
    );
  }

  return (
    <div className="px-5 py-5 lg:px-8">
      <EditableGrid
        pageKey="recruiting-jobs"
        panels={panels}
        defaultLayout={JOBS_DEFAULT_LAYOUT}
        savedLayout={savedLayout}
        savedWidgets={savedWidgets}
        canEdit={canEdit}
      />
    </div>
  );
}
