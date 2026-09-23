"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, Plane, Wrench } from "lucide-react";
import type { RecruitingJobDetail } from "@/lib/data/recruiting-jobs";
import { JobSectionTabs, useJobSection, type JobSectionTab } from "@/components/recruiting-jobs/JobSectionTabs";
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

function OverviewPane({
  job,
  canEdit,
  onSeeCandidates
}: {
  job: RecruitingJobDetail;
  canEdit: boolean;
  onSeeCandidates: () => void;
}) {
  const recent = job.linkedCandidates.slice(0, 4);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
        <CountBox label="Candidates" value={job.candidateCount} />
        <CountBox label="Requirements" value={job.requirementCount} />
        <CountBox label="Pay" value={job.paySummary ?? job.rawPayScale ?? "No pay recorded"} />
      </div>

      <section className={CARD}>
        <p className={EYEBROW}>Classification</p>
        <h3 className="text-base font-semibold text-brand-lea dark:text-slate-100">Role type, seat and aircraft</h3>
        <JobClassificationEditor
          key={job.id}
          jobId={job.id}
          isPilotRole={job.isPilotRole}
          pilotSeat={job.pilotSeat}
          aircraftTypes={job.aircraftTypes}
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

function RequirementPane({ job }: { job: RecruitingJobDetail }) {
  return (
    <section className={CARD}>
      <p className={EYEBROW}>Linked requirements</p>
      <h3 className="text-base font-semibold text-brand-lea dark:text-slate-100">Pilot requirement profiles</h3>
      <div className="mt-3 space-y-2">
        {job.linkedRequirements.length > 0 ? (
          job.linkedRequirements.map((requirement) => (
            <Link key={requirement.id} href={`/pilot-requirements?id=${requirement.id}`} className={ROW}>
              <div className="font-semibold text-brand-lea dark:text-slate-100">{requirement.title}</div>
              <div className="mt-1 text-xs text-brand-grey dark:text-slate-400">
                {[requirement.pilotSeat, requirement.status, requirement.reviewStatus].filter(Boolean).join(" - ")}
              </div>
            </Link>
          ))
        ) : (
          <p className={EMPTY}>
            No linked requirement profile yet. Without one there is nothing to score candidates against, so this role is
            not on the Matchboard.{" "}
            <Link href="/pilot-requirements" className="font-semibold text-brand-eden underline-offset-2 hover:underline dark:text-brand-sweet">
              Open Pilot requirements
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}

function CandidatesPane({ job }: { job: RecruitingJobDetail }) {
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

function SourcePane({ job }: { job: RecruitingJobDetail }) {
  const sourceText = job.rawMinimumRequirements || job.jobDescriptionText;
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
        <div className="mt-3 whitespace-pre-wrap rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-4 text-sm leading-6 text-brand-black/78 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
          {sourceText}
        </div>
      ) : (
        <p className="mt-3 text-sm text-brand-grey dark:text-slate-400">No source text is attached to this job yet.</p>
      )}
    </section>
  );
}

export function RecruitingJobPage({
  job,
  canEdit = false,
  requestedTab
}: {
  job: RecruitingJobDetail;
  canEdit?: boolean;
  requestedTab?: string;
}) {
  // A support job with no requirement profile has nothing to put behind the
  // requirement tab, so it does not get one — but a support job that somehow HAS
  // one still does, rather than the profile becoming unreachable.
  const showRequirement = job.isPilotRole || job.linkedRequirements.length > 0;

  // Stable reference: useJobSection rebuilds its popstate listener whenever this
  // changes.
  const tabs: JobSectionTab[] = useMemo(() => {
    const list: JobSectionTab[] = [{ key: "overview", label: "Overview" }];
    if (showRequirement) list.push({ key: "requirement", label: "Pilot requirement", chip: String(job.requirementCount) });
    list.push({ key: "candidates", label: "Candidates", chip: String(job.candidateCount) });
    list.push({ key: "screening", label: "Screening" });
    list.push({ key: "source", label: "Source text" });
    return list;
  }, [showRequirement, job.requirementCount, job.candidateCount]);

  const basePath = `/recruiting-jobs/${job.id}`;
  const [active, select] = useJobSection(tabs, requestedTab, basePath);

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
          <OverviewPane job={job} canEdit={canEdit} onSeeCandidates={() => select("candidates")} />
        ) : null}
        {active === "requirement" ? <RequirementPane job={job} /> : null}
        {active === "candidates" ? <CandidatesPane job={job} /> : null}
        {active === "screening" ? (
          screening ? (
            <JobScreeningPanel data={screening} />
          ) : (
            <div className={`${CARD} text-sm text-brand-grey dark:text-slate-400`}>
              {screeningFailed ? "Candidate fit could not be loaded. Reload the page to try again." : "Loading candidate fit…"}
            </div>
          )
        ) : null}
        {active === "source" ? <SourcePane job={job} /> : null}
      </div>
    </div>
  );
}
