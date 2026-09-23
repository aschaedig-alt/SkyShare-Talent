"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plane, Radar, Wrench } from "lucide-react";
import type { RecruitingJobDetail } from "@/lib/data/recruiting-jobs";
import type { JobRequirementTabData, JobRequirementView } from "@/lib/data/pilot-requirements";
import { JobSectionTabs, useJobSection, type JobSectionTab } from "@/components/recruiting-jobs/JobSectionTabs";
import { JobRequirementTab } from "@/components/recruiting-jobs/JobRequirementTab";
import type { RequirementPermissions } from "@/components/recruiting-jobs/RequirementPanel";
import { JobTitleField } from "@/components/recruiting-jobs/JobTitleField";
import { JobDetailsFields } from "@/components/recruiting-jobs/JobDetailsFields";
import { JobActiveToggle } from "@/components/recruiting-jobs/JobActiveToggle";
import { JobClassificationEditor } from "@/components/recruiting-jobs/JobClassificationEditor";
import { PaycomReqField } from "@/components/recruiting-jobs/PaycomReqField";
import { AddCandidateToJob } from "@/components/recruiting-jobs/AddCandidateToJob";
import { BatchAddCandidatesToJob } from "@/components/recruiting-jobs/BatchAddCandidatesToJob";
import { JobScreeningPanel } from "@/components/recruiting-jobs/JobScreeningPanel";
import { ResumeIntake } from "@/components/candidates/ResumeIntake";
import { DocumentIntake } from "@/components/candidates/DocumentIntake";
import { loadJobScreening } from "@/app/recruiting-jobs/screening-actions";
import type { JobScreeningData } from "@/lib/data/job-screening";

// One job, at its own address, with its sections behind tabs.
//
// What this replaced: eight separately chromed EditableGrid panels stacked to
// ~1388px against a 695px viewport, so the page scrolled before it held any
// data, and workspace-wide stat tiles sat beside job-specific ones. EditableGrid
// is a rearrangeable dashboard; this is a fixed master-detail workflow, so the
// grid (and with it "Edit layout" on this page) is gone. He approved dropping it.

const CARD = "rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10";
const EYEBROW = "text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold";
const ROW = "block rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 transition-shadow hover:shadow-glow dark:border-white/10 dark:bg-white/5";
const EMPTY = "rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 text-sm text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400";

function locationLabel(job: RecruitingJobDetail) {
  return [job.city, job.state].filter(Boolean).join(", ");
}

/** A fact that is missing is still worth showing — a job with no pay or no
 *  aircraft on it is the thing somebody has to go and fix. */
function Fact({ value, missing }: { value: string | null; missing: string }) {
  return value ? (
    <span>{value}</span>
  ) : (
    <span className="text-brand-grey/65 dark:text-slate-500">{missing}</span>
  );
}

function FactsLine({ job }: { job: RecruitingJobDetail }) {
  const facts: ReactNode[] = [
    <span key="type" className="inline-flex items-center gap-1.5 font-semibold text-brand-eden dark:text-brand-sweet">
      {job.isPilotRole ? <Plane className="h-3.5 w-3.5" /> : <Wrench className="h-3.5 w-3.5" />}
      {job.isPilotRole ? "Pilot" : "Support"}
    </span>
  ];
  if (job.isPilotRole) {
    facts.push(<Fact key="seat" value={job.pilotSeat} missing="No seat" />);
    facts.push(<Fact key="aircraft" value={job.aircraftTypes.join(", ") || null} missing="No aircraft" />);
  }
  facts.push(<Fact key="base" value={locationLabel(job) || null} missing="No location" />);
  facts.push(<Fact key="pay" value={job.paySummary ?? job.rawPayScale} missing="No pay recorded" />);

  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-brand-grey dark:text-slate-400">
      {facts.map((fact, i) => (
        <span key={i} className="flex items-center gap-x-2">
          {i > 0 ? (
            <span aria-hidden className="text-brand-lea/25 dark:text-white/20">
              ·
            </span>
          ) : null}
          {fact}
        </span>
      ))}
    </p>
  );
}

function CountBox({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/55 p-3 dark:border-white/10 dark:bg-white/5">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">{label}</div>
      <div className="mt-1 break-words text-lg font-semibold text-brand-lea dark:text-slate-100">{value}</div>
    </div>
  );
}

function CandidateRow({ candidate }: { candidate: RecruitingJobDetail["linkedCandidates"][number] }) {
  return (
    <Link href={`/candidates/${candidate.id}`} className={ROW}>
      <div className="font-semibold text-brand-lea dark:text-slate-100">{candidate.displayName}</div>
      <div className="mt-1 text-xs text-brand-grey dark:text-slate-400">
        {[candidate.currentTitle, candidate.stage, candidate.status].filter(Boolean).join(" - ")}
      </div>
    </Link>
  );
}

/**
 * The way to the Matchboard from a job, landing on this job's role.
 *
 * Only an ACTIVE requirement is on the Matchboard, so a job whose requirement is
 * inactive says so instead of linking to a role the board does not list.
 */
function MatchboardStrip({ requirements }: { requirements: JobRequirementView[] }) {
  if (requirements.length === 0) return null;
  const onBoard = requirements.find((requirement) => requirement.status === "ACTIVE");
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-brand-lea/10 bg-brand-cloudDancer/45 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5">
      <span className="inline-flex items-center gap-2 text-brand-grey dark:text-slate-400">
        <Radar className="h-4 w-4 shrink-0 text-brand-gold" />
        {onBoard
          ? "The Matchboard checks everyone in the candidate pool against this role."
          : "Not on the Matchboard: this job's pilot requirement is not Active."}
      </span>
      {onBoard ? (
        <Link
          href={`/matching?mode=role&id=${onBoard.id}`}
          prefetch={false}
          className="inline-flex items-center gap-1 font-semibold text-brand-eden underline-offset-2 transition hover:underline dark:text-brand-sweet"
        >
          Open in Matchboard
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}

function OverviewPane({
  job,
  canEdit,
  requirements,
  onSeeCandidates
}: {
  job: RecruitingJobDetail;
  canEdit: boolean;
  requirements: JobRequirementView[];
  onSeeCandidates: () => void;
}) {
  const recent = job.linkedCandidates.slice(0, 4);
  // A requirement linked straight to this job is saved together with it, so its
  // Role block is where seat, aircraft and location are changed.
  const pairedWithRequirement = requirements.some((requirement) => requirement.pair);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
        <CountBox label="Candidates" value={job.candidateCount} />
        <CountBox label="Requirements" value={requirements.length} />
        <CountBox label="Pay" value={job.paySummary ?? job.rawPayScale ?? "No pay recorded"} />
      </div>

      <MatchboardStrip requirements={requirements} />

      <section className={CARD}>
        <p className={EYEBROW}>Classification</p>
        <h3 className="text-base font-semibold text-brand-lea dark:text-slate-100">Role type, seat and aircraft</h3>
        <JobClassificationEditor
          key={job.id}
          jobId={job.id}
          isPilotRole={job.isPilotRole}
          pilotSeat={job.pilotSeat}
          aircraftTypes={job.aircraftTypes}
          seatAndAircraftOnRequirementTab={pairedWithRequirement}
        />
        <PaycomReqField key={`paycom-${job.id}`} jobId={job.id} paycomReqId={job.paycomReqId} canEdit={canEdit} />
      </section>

      <section className={CARD}>
        <p className={EYEBROW}>Latest applicants</p>
        <h3 className="text-base font-semibold text-brand-lea dark:text-slate-100">
          {job.candidateCount > 0 ? `Most recent of ${job.candidateCount}` : "Nobody has applied yet"}
        </h3>
        <div className="mt-3 space-y-2">
          {recent.length > 0 ? (
            recent.map((candidate) => <CandidateRow key={candidate.id} candidate={candidate} />)
          ) : (
            <p className={EMPTY}>No linked candidates yet. Add one from the Candidates tab, or find matches on the Matchboard.</p>
          )}
        </div>
        {/* A button, not a link: this swaps a pane on the page you are already
            on, which is the case the house rule reserves buttons for. */}
        {job.candidateCount > recent.length ? (
          <button
            type="button"
            onClick={onSeeCandidates}
            className="mt-3 text-sm font-semibold text-brand-eden underline-offset-2 transition hover:underline dark:text-brand-sweet"
          >
            See all {job.candidateCount} applicants
          </button>
        ) : null}
      </section>
    </div>
  );
}

function CandidatesPane({ job, requirements }: { job: RecruitingJobDetail; requirements: JobRequirementView[] }) {
  return (
    <section className={CARD}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className={EYEBROW}>Linked candidates</p>
          <h3 className="text-base font-semibold text-brand-lea dark:text-slate-100">Applied or associated candidates</h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <ResumeIntake jobId={job.id} jobTitle={job.title} />
          <DocumentIntake jobId={job.id} />
          <AddCandidateToJob jobId={job.id} jobTitle={job.title} />
          <BatchAddCandidatesToJob jobId={job.id} jobTitle={job.title} />
        </div>
      </div>
      <div className="mt-3">
        <MatchboardStrip requirements={requirements} />
      </div>
      {/* No height cap and no scrollbar of its own. 279 applicants make a long
          page, and a long page is the correct answer — one scrollbar per screen. */}
      <div className="mt-3 space-y-2">
        {job.linkedCandidates.length > 0 ? (
          job.linkedCandidates.map((candidate) => <CandidateRow key={candidate.id} candidate={candidate} />)
        ) : (
          <p className={EMPTY}>
            No linked candidates yet. Use “Add candidate” to link one, or find matches on the Matchboard.
          </p>
        )}
      </div>
    </section>
  );
}

const SOURCE_TEXT =
  "mt-2 whitespace-pre-wrap rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-4 text-sm leading-6 text-brand-black/78 dark:border-white/10 dark:bg-white/5 dark:text-slate-300";

function SourcePane({ job, requirements }: { job: RecruitingJobDetail; requirements: JobRequirementView[] }) {
  const sourceText = job.rawMinimumRequirements || job.jobDescriptionText;
  // The posting was often kept ONLY on the pilot requirement: for most of the
  // active pilot roles the job's own text is empty or a short stub. The
  // requirement's "Source evidence" box was where it could be read, and that page
  // is gone, so its copy shows here — unless it is the same text as the job's.
  const keptOnRequirement = requirements
    .map((requirement) => ({
      id: requirement.id,
      title: requirement.title,
      text: requirement.rawMinimumRequirements || requirement.originalJobDescriptionText
    }))
    .filter((entry) => entry.text && entry.text.trim() !== (sourceText ?? "").trim());

  return (
    <section className={CARD}>
      <p className={EYEBROW}>Source record</p>
      <h3 className="text-base font-semibold text-brand-lea dark:text-slate-100">Imported job text</h3>
      <div className="mt-2 grid gap-2 text-xs text-brand-grey [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))] dark:text-slate-400">
        <div>Req ID: {job.jobReqId ?? "Not recorded"}</div>
        <div>Recruiter: {job.recruiter ?? "Not recorded"}</div>
        <div>Source: {job.sourceFilename ?? "Not recorded"}</div>
      </div>
      {sourceText ? (
        <div className="mt-3">
          {keptOnRequirement.length > 0 ? <p className={EYEBROW}>On the job</p> : null}
          <div className={SOURCE_TEXT}>{sourceText}</div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-brand-grey dark:text-slate-400">
          {keptOnRequirement.length > 0
            ? "The job itself has no posting text. The copy kept on its pilot requirement is below."
            : "No source text is attached to this job yet."}
        </p>
      )}
      {keptOnRequirement.map((entry) => (
        <div key={entry.id} className="mt-4">
          <p className={EYEBROW}>Kept on the pilot requirement “{entry.title}”</p>
          <div className={SOURCE_TEXT}>{entry.text}</div>
        </div>
      ))}
    </section>
  );
}

export function RecruitingJobPage({
  job,
  canEdit = false,
  requestedTab,
  requirementTab,
  requestedRequirement,
  permissions
}: {
  job: RecruitingJobDetail;
  canEdit?: boolean;
  requestedTab?: string;
  /** Everything the Pilot requirement tab shows, including requirements left on jobs merged into this one. */
  requirementTab: JobRequirementTabData;
  /** ?req= — which requirement to open when the job holds more than one. */
  requestedRequirement?: string;
  permissions: RequirementPermissions;
}) {
  const requirements = requirementTab.requirements;
  // A support job with no requirement has nothing to put behind the requirement
  // tab, so it does not get one — but a support job that somehow HAS one still
  // does, rather than the requirement becoming unreachable.
  const showRequirement = job.isPilotRole || requirements.length > 0;
  const requirementCount = requirements.length;

  // Stable reference: useJobSection rebuilds its popstate listener whenever this
  // changes.
  const tabs: JobSectionTab[] = useMemo(() => {
    const list: JobSectionTab[] = [{ key: "overview", label: "Overview" }];
    if (showRequirement) list.push({ key: "requirement", label: "Pilot requirement", chip: String(requirementCount) });
    list.push({ key: "candidates", label: "Candidates", chip: String(job.candidateCount) });
    list.push({ key: "screening", label: "Screening" });
    list.push({ key: "source", label: "Source text" });
    return list;
  }, [showRequirement, requirementCount, job.candidateCount]);

  const basePath = `/recruiting-jobs/${job.id}`;
  const [active, select] = useJobSection(tabs, requestedTab, basePath);

  // Which requirement the tab shows, held here rather than in the tab so it
  // survives a trip to another section and back. Only matters for a job holding
  // more than one; an old link can name one with ?req=.
  const [selectedRequirement, setSelectedRequirement] = useState<string | null>(() =>
    requestedRequirement && requirements.some((requirement) => requirement.id === requestedRequirement)
      ? requestedRequirement
      : requirements[0]?.id ?? null
  );

  // Screening is a ranked scan of the whole candidate pool, so it is paid for
  // only once somebody opens the tab — the old page ran it on every job
  // selection, whether or not anyone looked. Kept once it has loaded, so moving
  // between tabs does not re-scan.
  //
  // A null result means "not fetched yet", never "nothing to show":
  // loadJobScreening answers a refusal with the module's own empty result, so a
  // job with no candidate fit still comes back as data and the panel renders its
  // own empty state. That distinction is what keeps a link straight to
  // ?tab=screening from server-rendering "not available" before the fetch that
  // would have disproved it.
  const [screening, setScreening] = useState<JobScreeningData | null>(null);
  const [screeningFailed, setScreeningFailed] = useState(false);
  const screeningRequested = useRef(false);
  useEffect(() => {
    if (active !== "screening" || screeningRequested.current) return;
    screeningRequested.current = true;
    let alive = true;
    loadJobScreening(job.id)
      .then((data) => {
        if (alive) setScreening(data);
      })
      .catch(() => {
        if (alive) setScreeningFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [active, job.id]);

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <Link
        href="/recruiting-jobs"
        className="inline-flex items-center gap-1 text-sm font-semibold text-brand-eden underline-offset-2 transition hover:underline dark:text-brand-sweet"
      >
        <ChevronLeft className="h-4 w-4" />
        All jobs
      </Link>

      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={EYEBROW}>{job.isPilotRole ? "Pilot job" : "Support job"}</p>
            <JobTitleField key={`title-${job.id}`} jobId={job.id} title={job.title} canEdit={canEdit} />
            <JobDetailsFields
              key={`details-${job.id}`}
              jobId={job.id}
              department={job.department}
              city={job.city}
              state={job.state}
              canEdit={canEdit}
              locationOnRequirementTab={requirements.some((requirement) => requirement.pair)}
            />
          </div>
          <JobActiveToggle key={`active-${job.id}`} jobId={job.id} status={job.status} canEdit={canEdit} />
        </div>
        <FactsLine job={job} />
        <div className="mt-4 border-t border-brand-lea/10 pt-3 dark:border-white/10">
          <JobSectionTabs basePath={basePath} tabs={tabs} active={active} onSelect={select} />
        </div>
      </section>

      <div role="tabpanel">
        {active === "overview" ? (
          <OverviewPane
            job={job}
            canEdit={canEdit}
            requirements={requirements}
            onSeeCandidates={() => select("candidates")}
          />
        ) : null}
        {active === "requirement" ? (
          <JobRequirementTab
            job={{ id: job.id, title: job.title, status: job.status }}
            basePath={basePath}
            data={requirementTab}
            selectedId={selectedRequirement}
            onSelect={setSelectedRequirement}
            permissions={permissions}
          />
        ) : null}
        {active === "candidates" ? <CandidatesPane job={job} requirements={requirements} /> : null}
        {active === "screening" ? (
          screening ? (
            <JobScreeningPanel data={screening} />
          ) : (
            <div className={`${CARD} text-sm text-brand-grey dark:text-slate-400`}>
              {screeningFailed ? "Candidate fit could not be loaded. Reload the page to try again." : "Loading candidate fit…"}
            </div>
          )
        ) : null}
        {active === "source" ? <SourcePane job={job} requirements={requirements} /> : null}
      </div>
    </div>
  );
}
