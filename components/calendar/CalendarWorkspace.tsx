"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, List } from "lucide-react";
import { clsx } from "clsx";
import type { CalendarData } from "@/lib/data/calendar";
import { ScheduleInterviewForm } from "@/components/calendar/ScheduleInterviewForm";
import { MonthCalendar } from "@/components/calendar/MonthCalendar";
import { EditInterviewModal } from "@/components/calendar/EditInterviewModal";

type CalendarWorkspaceProps = {
  data: CalendarData;
};

type Interview = CalendarData["interviews"][number];

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

function statusBadgeColor(status: string) {
  switch (status) {
    case "SCHEDULED":
      return "bg-blue-100 text-blue-800";
    case "COMPLETED":
      return "bg-emerald-100 text-emerald-800";
    case "CANCELLED":
      return "bg-slate-100 text-slate-500";
    default:
      return "bg-brand-sweet/25 text-brand-lea";
  }
}

export function CalendarWorkspace({ data }: CalendarWorkspaceProps) {
  const router = useRouter();
  const [view, setView] = useState<"month" | "list">("month");
  const [editingInterview, setEditingInterview] = useState<Interview | null>(null);
  const [prefilledDate, setPrefilledDate] = useState<Date | null>(null);

  function handleDayClick(date: Date) {
    setPrefilledDate(date);
    // Scroll to schedule form
    document.getElementById("schedule-form")?.scrollIntoView({ behavior: "smooth" });
  }

  function handleInterviewClick(interview: Interview) {
    setEditingInterview(interview);
  }

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      {/* Header */}
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Interview operations</p>
            <h1 className="text-2xl font-semibold text-brand-lea">Calendar</h1>
            <p className="mt-1 max-w-3xl text-sm text-brand-grey">
              Schedule and manage candidate interviews. Click a day to schedule, click an interview to edit.
            </p>
          </div>

          {/* View Toggle */}
          <div className="flex items-center gap-1 rounded-lg border border-brand-lea/15 p-1">
            <button
              onClick={() => setView("month")}
              className={clsx(
                "flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-semibold transition",
                view === "month" ? "bg-brand-lea text-white" : "text-brand-grey hover:text-brand-lea"
              )}
            >
              <CalendarDays className="h-4 w-4" />
              Month
            </button>
            <button
              onClick={() => setView("list")}
              className={clsx(
                "flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-semibold transition",
                view === "list" ? "bg-brand-lea text-white" : "text-brand-grey hover:text-brand-lea"
              )}
            >
              <List className="h-4 w-4" />
              List
            </button>
          </div>
        </div>
      </section>

      {/* Stats */}
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
        {/* Left: Schedule Form */}
        <div className="space-y-4" id="schedule-form">
          <ScheduleInterviewForm candidates={data.candidates} jobs={data.jobs} prefilledDate={prefilledDate} />

          <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">Google Calendar</p>
            <h2 className="text-base font-semibold text-brand-lea">Connection status</h2>
            <div className="mt-3 rounded border border-brand-lea/10 bg-brand-cloudDancer/50 p-3 text-sm text-brand-grey">
              Local-only mode is active. Two-way Google Calendar sync is coming in Phase 2.3.
            </div>
          </section>
        </div>

        {/* Right: Calendar or List */}
        {view === "month" ? (
          <MonthCalendar
            interviews={data.interviews}
            onDayClick={handleDayClick}
            onInterviewClick={handleInterviewClick}
          />
        ) : (
          <section className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10">
            <div className="border-b border-brand-lea/10 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">Interview manifest</p>
              <h2 className="text-base font-semibold text-brand-lea">Upcoming and recent interviews</h2>
            </div>
            <div className="p-4">
              {data.interviews.length > 0 ? (
                <div className="space-y-3">
                  {data.interviews.map((interview) => (
                    <article
                      key={interview.id}
                      className="cursor-pointer rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-4 transition hover:border-brand-sweet hover:bg-brand-sweet/10"
                      onClick={() => handleInterviewClick(interview)}
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-brand-lea">{interview.title}</div>
                          <Link
                            href={`/candidates/${interview.candidate.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1 inline-block text-lg font-semibold text-brand-lea hover:text-brand-eden"
                          >
                            {interview.candidate.displayName}
                          </Link>
                          <div className="mt-1 text-xs text-brand-grey">
                            {[interview.candidate.currentTitle, interview.job?.title].filter(Boolean).join(" - ")}
                          </div>
                        </div>
                        <span className={clsx("w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold", statusBadgeColor(interview.status))}>
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
                              <a
                                href={interview.meetingUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-brand-eden hover:text-brand-lea"
                              >
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
                  <p className="mt-2 text-sm text-brand-grey">Use the schedule form to add a candidate interview.</p>
                </div>
              )}
            </div>
          </section>
        )}
      </section>

      {/* Edit Modal */}
      {editingInterview && (
        <EditInterviewModal
          interview={editingInterview}
          jobs={data.jobs}
          onClose={() => setEditingInterview(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}
