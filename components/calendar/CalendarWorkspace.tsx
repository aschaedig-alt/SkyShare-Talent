import Link from "next/link";
import type { CalendarData } from "@/lib/data/calendar";
import { ScheduleInterviewForm } from "@/components/calendar/ScheduleInterviewForm";

type CalendarWorkspaceProps = {
  data: CalendarData;
};

const statLabels: Array<[keyof CalendarData["stats"], string]> = [
  ["scheduled", "Scheduled"],
  ["thisWeek", "This week"],
  ["completed", "Completed"],
  ["candidates", "Candidate options"]
];

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function CalendarWorkspace({ data }: CalendarWorkspaceProps) {
  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Interview operations</p>
        <h1 className="text-2xl font-semibold text-brand-lea">Calendar</h1>
        <p className="mt-1 max-w-3xl text-sm text-brand-grey">
          Schedule local candidate interviews, track upcoming recruiting activity, and prepare for future Google
          Calendar sync.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statLabels.map(([key, label]) => (
          <div key={key} className="rounded bg-white p-3 shadow-panel ring-1 ring-brand-lea/10">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-grey">{label}</div>
            <div className="mt-1 text-xl font-semibold text-brand-lea">{data.stats[key]}</div>
            <div className="mt-2 h-1 rounded-full bg-brand-gold/25">
              <div className="h-1 w-2/3 rounded-full bg-brand-sweet" />
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[440px_1fr]">
        <div className="space-y-4">
          <ScheduleInterviewForm candidates={data.candidates} jobs={data.jobs} />

          <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">
              Google Calendar
            </p>
            <h2 className="text-base font-semibold text-brand-lea">Connection status</h2>
            <div className="mt-3 rounded border border-brand-lea/10 bg-brand-cloudDancer/50 p-3 text-sm text-brand-grey">
              Local-only mode is active. OAuth, calendar selection, and two-way sync will be added after the backend
              deployment target is confirmed.
            </div>
          </section>
        </div>

        <section className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10">
          <div className="border-b border-brand-lea/10 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">Interview manifest</p>
            <h2 className="text-base font-semibold text-brand-lea">Upcoming and recent interviews</h2>
          </div>
          <div className="p-4">
            {data.interviews.length > 0 ? (
              <div className="space-y-3">
                {data.interviews.map((interview) => (
                  <article key={interview.id} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-brand-lea">{interview.title}</div>
                        <Link
                          href={`/candidates/${interview.candidate.id}`}
                          className="mt-1 inline-block text-lg font-semibold text-brand-lea hover:text-brand-eden"
                        >
                          {interview.candidate.displayName}
                        </Link>
                        <div className="mt-1 text-xs text-brand-grey">
                          {[interview.candidate.currentTitle, interview.job?.title].filter(Boolean).join(" - ")}
                        </div>
                      </div>
                      <span className="w-fit rounded-full bg-brand-sweet/25 px-2.5 py-1 text-[11px] font-semibold text-brand-lea">
                        {interview.status}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-2 text-xs text-brand-grey md:grid-cols-3">
                      <div>
                        <span className="font-semibold text-brand-lea">Starts</span>
                        <br />
                        {formatDateTime(interview.startDateTime)}
                      </div>
                      <div>
                        <span className="font-semibold text-brand-lea">Interviewer</span>
                        <br />
                        {interview.interviewer ?? "Not assigned"}
                      </div>
                      <div>
                        <span className="font-semibold text-brand-lea">Location</span>
                        <br />
                        {interview.location ?? "Not recorded"}
                        {interview.meetingUrl ? (
                          <>
                            <br />
                            <a href={interview.meetingUrl} target="_blank" rel="noreferrer" className="text-brand-eden hover:text-brand-lea">
                              Open meeting link
                            </a>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {interview.notes ? <p className="mt-3 text-sm leading-6 text-brand-black/75">{interview.notes}</p> : null}
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-8 text-center">
                <div className="text-lg font-semibold text-brand-lea">No interviews scheduled yet</div>
                <p className="mt-2 text-sm text-brand-grey">
                  Use the schedule form to add a local candidate interview.
                </p>
              </div>
            )}
          </div>
        </section>
      </section>
    </div>
  );
}
