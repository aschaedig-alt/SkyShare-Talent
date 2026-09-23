"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { ChevronDown, ChevronRight, Plane, Users, Wrench } from "lucide-react";
import { Button } from "@/components/ui";
import { NewJobButton } from "@/components/recruiting-jobs/NewJobButton";
import type { RecruitingJobsData } from "@/lib/data/recruiting-jobs";
import type { NoJobRequirement } from "@/lib/data/pilot-requirements";

// The jobs list: every role as a card, and every card a real link to that job's
// own page. The workspace-wide stat tiles that used to sit beside the
// job-specific ones are gone; what replaced them is the filter counts, which
// answer the same question ("how many open? how many pilot?") and also DO
// something when you click them.

type Job = RecruitingJobsData["jobs"][number];
type StatusFilter = "open" | "inactive" | "all";
type TypeFilter = "all" | "pilot" | "support";

const SEGMENT = "inline-flex overflow-hidden rounded border border-brand-lea/20 dark:border-white/15";
const SEGMENT_BUTTON = "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold transition hover:shadow-glow";

function locationLabel(job: Job) {
  return [job.city, job.state].filter(Boolean).join(", ");
}

function subtitle(job: Job) {
  if (job.isPilotRole) {
    return [job.pilotSeat, job.aircraftTypes.join(", ") || null, locationLabel(job) || null].filter(Boolean).join(" · ") || "Pilot role";
  }
  return [job.department, locationLabel(job) || null].filter(Boolean).join(" · ") || "No department or location";
}

function matchesStatus(job: Job, status: StatusFilter) {
  return status === "all" || (status === "open" ? job.isActive : !job.isActive);
}

function matchesType(job: Job, type: TypeFilter) {
  return type === "all" || (type === "pilot" ? job.isPilotRole : !job.isPilotRole);
}

function Segment<T extends string>({
  label,
  options,
  value,
  onChange
}: {
  label: string;
  options: Array<{ value: T; label: string; count?: number }>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className={SEGMENT} role="group" aria-label={label}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.value)}
            className={clsx(
              SEGMENT_BUTTON,
              on
                ? // The gold underline is doing real work in dark mode, where the
                  // selected navy sits on a panel that is almost the same navy.
                  "bg-brand-lea text-white shadow-[inset_0_-3px_0_theme(colors.brand.gold)]"
                : "bg-white text-brand-grey hover:bg-brand-cloudDancer/50 hover:text-brand-lea dark:bg-brand-panel dark:text-slate-400"
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span
                className={clsx(
                  "rounded px-1.5 py-0.5 text-[11px] font-bold",
                  on ? "bg-brand-gold text-brand-lea" : "bg-brand-lea/10 text-brand-eden dark:bg-white/10 dark:text-brand-sweet"
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function JobCard({ job }: { job: Job }) {
  // A pilot role with no requirement profile cannot be screened and is not on
  // the Matchboard, which is worth seeing from the list rather than one click in.
  const noRequirement = job.isPilotRole && job.requirementCount === 0;
  return (
    <Link
      href={`/recruiting-jobs/${job.id}`}
      className="flex flex-col gap-1.5 rounded bg-white p-3.5 shadow-panel ring-1 ring-brand-lea/10 transition hover:shadow-glow dark:bg-brand-panel dark:ring-white/10"
    >
      <span className="flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 font-semibold text-brand-eden dark:text-brand-sweet">
          {job.isPilotRole ? <Plane className="h-3.5 w-3.5" /> : <Wrench className="h-3.5 w-3.5" />}
          {job.isPilotRole ? "Pilot" : "Support"}
        </span>
        {noRequirement ? (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
            No requirement
          </span>
        ) : null}
      </span>
      <span className="break-words text-sm font-semibold text-brand-lea dark:text-slate-100">{job.title}</span>
      <span className="text-xs text-brand-grey dark:text-slate-400">{subtitle(job)}</span>
      <span className="mt-1 flex items-center justify-between gap-2 text-xs text-brand-grey dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          {job.candidateCount} {job.candidateCount === 1 ? "applicant" : "applicants"}
        </span>
        <span className={job.isActive ? "font-semibold text-emerald-700 dark:text-emerald-300" : ""}>
          {job.isActive ? "Active" : "Inactive"}
        </span>
      </span>
    </Link>
  );
}

function sentence(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");
}

/**
 * Pilot requirements that belong to no live job.
 *
 * They used to be found on the Pilot Requirements page. That page is gone —
 * a requirement is a tab on its job now — so these would otherwise be
 * unreachable. Measured Sep 23: 9, every one a managed-aircraft role with a tail
 * number and no job, all Inactive. (The four the mockup counted as "left behind
 * by a merge" are not here: followed through the merge they belong to a live
 * job, and show on its tab.)
 *
 * Closed by default: these are leftovers, and the page is for jobs. A search
 * that matches one opens the list, so a search still finds it.
 */
function NoJobRequirements({ requirements, query }: { requirements: NoJobRequirement[]; query: string }) {
  const [open, setOpen] = useState(Boolean(query));
  if (requirements.length === 0) return null;
  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      {/* Opens a list in place, so a button rather than a link. */}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span>
          <span className="block text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">No job</span>
          <span className="block text-base font-semibold text-brand-lea dark:text-slate-100">
            {requirements.length} pilot requirement{requirements.length === 1 ? " has" : "s have"} no job
            {query ? " matching this search" : ""}
          </span>
        </span>
        {open ? (
          <ChevronDown className="h-5 w-5 shrink-0 text-brand-eden dark:text-brand-sweet" />
        ) : (
          <ChevronRight className="h-5 w-5 shrink-0 text-brand-eden dark:text-brand-sweet" />
        )}
      </button>
      {open ? (
        <>
          <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
            Kept so their hours, certificates and tail numbers are not lost. Open one to read or edit it; a pilot job with
            no requirement offers to attach a matching one.
          </p>
          <div className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
            {requirements.map((requirement) => (
              <Link
                key={requirement.id}
                href={`/recruiting-jobs/requirements/${requirement.id}`}
                className="block rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 transition hover:shadow-glow dark:border-white/10 dark:bg-white/5"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0 break-words text-sm font-semibold text-brand-lea dark:text-slate-100">{requirement.title}</span>
                  <span className="shrink-0 rounded bg-brand-cloudDancer px-1.5 py-0.5 text-[11px] font-bold text-brand-grey dark:bg-white/10 dark:text-slate-400">
                    {sentence(requirement.status)}
                  </span>
                </span>
                <span className="mt-1 block text-xs text-brand-grey dark:text-slate-400">
                  {[requirement.pilotSeat, requirement.operatorType, requirement.tails.length ? `Tail ${requirement.tails.join(", ")}` : null]
                    .filter(Boolean)
                    .join(" · ") || "No seat or operator recorded"}
                </span>
                <span className="mt-1 block text-xs text-brand-grey dark:text-slate-400">
                  {requirement.lostJobTitle
                    ? `Its job, “${requirement.lostJobTitle}”, was merged into one that no longer exists`
                    : "Set up without a job"}
                  {" · "}
                  {requirement.enabledGateCount} of {requirement.gateCount} requirements on
                </span>
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

export function RecruitingJobsList({
  jobs,
  query,
  canEdit = false,
  noJobRequirements = []
}: {
  jobs: Job[];
  query: string;
  canEdit?: boolean;
  /** Already narrowed by the search box on the server. */
  noJobRequirements?: NoJobRequirement[];
}) {
  // Open first, because the roles you are hiring for are the ones you came here
  // for — the old list showed everything and only sorted the closed ones down,
  // where 40-odd retired requisitions still buried them. The counts beside the
  // other two filters say what is being held back.
  const [status, setStatus] = useState<StatusFilter>("open");
  const [type, setType] = useState<TypeFilter>("all");

  // Each count applies the OTHER filter, so it says what clicking it would
  // actually show. `jobs` has already been narrowed by the server-side search,
  // so the counts follow the search box too.
  const counts = useMemo(
    () => ({
      open: jobs.filter((job) => job.isActive && matchesType(job, type)).length,
      inactive: jobs.filter((job) => !job.isActive && matchesType(job, type)).length,
      all: jobs.filter((job) => matchesType(job, type)).length,
      pilot: jobs.filter((job) => job.isPilotRole && matchesStatus(job, status)).length,
      support: jobs.filter((job) => !job.isPilotRole && matchesStatus(job, status)).length
    }),
    [jobs, status, type]
  );

  const visible = useMemo(
    () => jobs.filter((job) => matchesStatus(job, status) && matchesType(job, type)),
    [jobs, status, type]
  );

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        {/* NewJobButton is a direct child rather than sitting in a wrapper: when
            its form opens it goes w-full, which only takes a line of its own if
            this flex row is its parent. */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Role operations</p>
            <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Jobs</h1>
          </div>
          {canEdit ? <NewJobButton /> : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
          {/* A GET form, so the search stays in ?q= and is still the server's
              matchesSearch — the same one filter as before, not a second copy of
              it in the browser. */}
          <form className="flex min-w-[260px] flex-1 gap-2">
            <input
              name="q"
              defaultValue={query}
              placeholder="Search title, department, aircraft, base, status"
              className="min-w-0 flex-1 rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-black outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
            />
            <Button type="submit" size="sm">
              Search
            </Button>
          </form>

          {/* Explicit type argument: inference reads the option literals as plain
              strings, which will not assign back to the setter. */}
          <Segment<StatusFilter>
            label="Job status filter"
            value={status}
            onChange={setStatus}
            options={[
              { value: "open", label: "Open", count: counts.open },
              { value: "inactive", label: "Inactive", count: counts.inactive },
              { value: "all", label: "All", count: counts.all }
            ]}
          />
          <Segment<TypeFilter>
            label="Role type filter"
            value={type}
            onChange={setType}
            options={[
              { value: "all", label: "All types" },
              { value: "pilot", label: "Pilot", count: counts.pilot },
              { value: "support", label: "Support", count: counts.support }
            ]}
          />
        </div>
      </section>

      {jobs.length === 0 ? (
        <section className="rounded bg-white p-8 text-center shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">
            {query ? "No jobs match that search" : "No jobs yet"}
          </h2>
          <p className="mt-2 text-sm text-brand-grey dark:text-slate-400">
            {query ? (
              <Link href="/recruiting-jobs" className="font-semibold text-brand-eden underline-offset-2 hover:underline dark:text-brand-sweet">
                Clear the search
              </Link>
            ) : (
              "Import or seed recruiting jobs to populate this workspace."
            )}
          </p>
        </section>
      ) : visible.length === 0 ? (
        <section className="rounded bg-white p-8 text-center shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">No jobs match these filters</h2>
          <p className="mt-2 text-sm text-brand-grey dark:text-slate-400">
            {counts.all} {counts.all === 1 ? "job is" : "jobs are"} here with the status filter cleared.
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => {
              setStatus("all");
              setType("all");
            }}
          >
            Show them all
          </Button>
        </section>
      ) : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
          {visible.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}

      <NoJobRequirements requirements={noJobRequirements} query={query} />
    </div>
  );
}
