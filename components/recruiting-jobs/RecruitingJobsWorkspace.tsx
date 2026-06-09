import Link from "next/link";
import type { RecruitingJobDetail, RecruitingJobsData } from "@/lib/data/recruiting-jobs";

type RecruitingJobsWorkspaceProps = {
  data: RecruitingJobsData;
  query: string;
};

const statLabels: Array<[keyof RecruitingJobsData["stats"], string]> = [
  ["total", "Imported roles"],
  ["open", "Open"],
  ["pilot", "Pilot"],
  ["support", "Support"],
  ["withCandidates", "With candidates"]
];

function locationLabel(job: { city: string | null; state: string | null }) {
  return [job.city, job.state].filter(Boolean).join(", ") || "No base";
}

function JobDetail({ job }: { job: RecruitingJobDetail | null }) {
  if (!job) {
    return (
      <section className="rounded bg-white p-8 text-center shadow-panel ring-1 ring-brand-lea/10">
        <h2 className="text-lg font-semibold text-brand-lea">No jobs yet</h2>
        <p className="mt-2 text-sm text-brand-grey">Import or seed recruiting jobs to populate this workspace.</p>
      </section>
    );
  }

  const sourceText = job.rawMinimumRequirements || job.jobDescriptionText;

  return (
    <div className="space-y-4">
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">
              Job detail
            </p>
            <h2 className="text-2xl font-semibold text-brand-lea">{job.title}</h2>
            <p className="mt-1 text-sm text-brand-grey">
              {[job.department, job.status, locationLabel(job)].filter(Boolean).join(" - ")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-brand-sweet/60 bg-brand-sweet/18 px-2.5 py-1 text-[11px] font-semibold text-brand-lea">
                {job.isPilotRole ? "Pilot role" : "Support role"}
              </span>
              {job.pilotSeat ? (
                <span className="rounded-full border border-brand-sweet/60 bg-brand-sweet/18 px-2.5 py-1 text-[11px] font-semibold text-brand-lea">
                  {job.pilotSeat}
                </span>
              ) : null}
              {job.aircraftTypes.map((aircraft) => (
                <span
                  key={aircraft}
                  className="rounded-full border border-brand-sweet/60 bg-brand-sweet/18 px-2.5 py-1 text-[11px] font-semibold text-brand-lea"
                >
                  {aircraft}
                </span>
              ))}
            </div>
          </div>
          <div className="grid min-w-full grid-cols-2 gap-2 text-sm sm:min-w-[420px] sm:grid-cols-4">
            <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/55 p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">Candidates</div>
              <div className="mt-1 text-lg font-semibold text-brand-lea">{job.candidateCount}</div>
            </div>
            <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/55 p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">Requirements</div>
              <div className="mt-1 text-lg font-semibold text-brand-lea">{job.requirementCount}</div>
            </div>
            <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/55 p-3 sm:col-span-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">Pay</div>
              <div className="mt-1 truncate text-sm font-semibold text-brand-lea">
                {job.paySummary ?? job.rawPayScale ?? "No pay recorded"}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">
            Linked requirements
          </p>
          <h3 className="text-base font-semibold text-brand-lea">Pilot requirement profiles</h3>
          <div className="mt-3 space-y-2">
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

        <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">
            Linked candidates
          </p>
          <h3 className="text-base font-semibold text-brand-lea">Applied or associated candidates</h3>
          <div className="mt-3 space-y-2">
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
      </section>

      <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">
          Source record
        </p>
        <h3 className="text-base font-semibold text-brand-lea">Imported job text</h3>
        <div className="mt-2 grid gap-2 text-xs text-brand-grey sm:grid-cols-3">
          <div>Req ID: {job.jobReqId ?? "Not recorded"}</div>
          <div>Recruiter: {job.recruiter ?? "Not recorded"}</div>
          <div>Source: {job.sourceFilename ?? "Not recorded"}</div>
        </div>
        {sourceText ? (
          <div className="mt-3 max-h-[280px] overflow-auto rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-4 text-sm leading-6 text-brand-black/78 whitespace-pre-wrap">
            {sourceText}
          </div>
        ) : (
          <p className="mt-3 text-sm text-brand-grey">No source text is attached to this job yet.</p>
        )}
      </section>
    </div>
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

export function RecruitingJobsWorkspace({ data, query }: RecruitingJobsWorkspaceProps) {
  const pilotJobs = data.jobs.filter((job) => job.isPilotRole);
  const supportJobs = data.jobs.filter((job) => !job.isPilotRole);
  const selectedId = data.selectedJob?.id ?? null;

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">
              Role operations
            </p>
            <h1 className="text-2xl font-semibold text-brand-lea">Jobs</h1>
            <p className="mt-1 max-w-3xl text-sm text-brand-grey">
              Imported role records, linked pilot requirements, and candidate coverage. Publishing workflows remain in Job Builder.
            </p>
          </div>
          <form className="flex w-full gap-2 xl:w-[520px]">
            <input
              name="q"
              defaultValue={query}
              placeholder="Search title, department, aircraft, base, status"
              className="min-w-0 flex-1 rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-black outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20"
            />
            <button
              type="submit"
              className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden"
            >
              Search
            </button>
          </form>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {statLabels.map(([key, label]) => (
          <div key={key} className="rounded bg-white p-3 shadow-panel ring-1 ring-brand-lea/10">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-grey">
              {label}
            </div>
            <div className="mt-1 text-xl font-semibold text-brand-lea">{data.stats[key]}</div>
            <div className="mt-2 h-1 rounded-full bg-brand-gold/25">
              <div className="h-1 w-2/3 rounded-full bg-brand-sweet" />
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <aside className="space-y-4">
          <section className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10">
            <div className="border-b border-brand-lea/10 px-4 py-3">
              <h2 className="text-base font-semibold text-brand-lea">Pilot jobs</h2>
              <p className="text-xs text-brand-grey">{pilotJobs.length} shown</p>
            </div>
            <div className="max-h-[420px] overflow-y-auto p-3">
              {pilotJobs.length > 0 ? (
                <div className="space-y-2">
                  {pilotJobs.map((job) => (
                    <JobCard key={job.id} job={job} selectedId={selectedId} query={query} />
                  ))}
                </div>
              ) : (
                <p className="p-4 text-sm text-brand-grey">No pilot jobs match the current search.</p>
              )}
            </div>
          </section>

          <section className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10">
            <div className="border-b border-brand-lea/10 px-4 py-3">
              <h2 className="text-base font-semibold text-brand-lea">Support jobs</h2>
              <p className="text-xs text-brand-grey">{supportJobs.length} shown</p>
            </div>
            <div className="max-h-[300px] overflow-y-auto p-3">
              {supportJobs.length > 0 ? (
                <div className="space-y-2">
                  {supportJobs.map((job) => (
                    <JobCard key={job.id} job={job} selectedId={selectedId} query={query} />
                  ))}
                </div>
              ) : (
                <p className="p-4 text-sm text-brand-grey">No support jobs match the current search.</p>
              )}
            </div>
          </section>
        </aside>

        <JobDetail job={data.selectedJob} />
      </section>
    </div>
  );
}
