"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, CalendarRange, Square, List, Mail, Phone } from "lucide-react";
import { clsx } from "clsx";
import type { CalendarData } from "@/lib/data/calendar";
import { ScheduleInterviewForm } from "@/components/calendar/ScheduleInterviewForm";
import { MonthCalendar } from "@/components/calendar/MonthCalendar";
import { TimeGridCalendar } from "@/components/calendar/TimeGridCalendar";
import { EditInterviewModal } from "@/components/calendar/EditInterviewModal";
import { UpcomingInterviews } from "@/components/calendar/UpcomingInterviews";
import { formatDateTimeWithZone } from "@/lib/calendar/format";

type CalendarWorkspaceProps = {
  data: CalendarData;
};

type Interview = CalendarData["interviews"][number];
type ViewMode = "month" | "week" | "day" | "list";

const statLabels: Array<[keyof CalendarData["stats"], string]> = [
  ["scheduled", "Scheduled"],
  ["thisWeek", "This week"],
  ["completed", "Completed"],
  ["candidates", "Candidate options"]
];

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

const viewOptions: Array<{ id: ViewMode; label: string; icon: typeof CalendarDays }> = [
  { id: "month", label: "Month", icon: CalendarDays },
  { id: "week", label: "Week", icon: CalendarRange },
  { id: "day", label: "Day", icon: Square },
  { id: "list", label: "List", icon: List }
];

export function CalendarWorkspace({ data }: CalendarWorkspaceProps) {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("month");
  const [editingInterview, setEditingInterview] = useState<Interview | null>(null);
  const [prefilledDate, setPrefilledDate] = useState<Date | null>(null);

  function handleDayClick(date: Date) {
    setPrefilledDate(date);
    document.getElementById("schedule-form")?.scrollIntoView({ behavior: "smooth" });
  }

  function handleInterviewClick(interview: Interview) {
    setEditingInterview(interview);
  }

  // Drag-to-reschedule. Month drops keep the original time-of-day; week/day drops
  // use the exact dropped slot (date + hour).
  async function handleReschedule(
    interviewId: string,
    newDate: Date,
    options?: { keepOriginalTime?: boolean }
  ) {
    const interview = data.interviews.find((i) => i.id === interviewId);
    if (!interview) return;

    const oldStart = new Date(interview.startDateTime);
    const newStart = new Date(newDate);
    if (options?.keepOriginalTime) {
      newStart.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0);
    }

    // Compute duration to preserve it
    const oldEnd = interview.endDateTime ? new Date(interview.endDateTime) : null;
    const durationMinutes = oldEnd ? Math.round((oldEnd.getTime() - oldStart.getTime()) / 60000) : 60;

    const pad = (n: number) => String(n).padStart(2, "0");
    const startDateTime = `${newStart.getFullYear()}-${pad(newStart.getMonth() + 1)}-${pad(newStart.getDate())}T${pad(newStart.getHours())}:${pad(newStart.getMinutes())}`;

    try {
      const response = await fetch(`/api/interviews/${interviewId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDateTime, durationMinutes })
      });
      if (response.ok) {
        router.refresh();
      }
    } catch {
      // silently fail; user can retry
    }
  }

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      {/* Header */}
      <section className="rounded-xl bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Interview operations</p>
            <h1 className="text-2xl font-semibold text-brand-lea">Calendar</h1>
            <p className="mt-1 max-w-3xl text-sm text-brand-grey">
              Schedule and manage candidate interviews. Click a day or time to schedule, click an interview to edit, or drag to reschedule.
            </p>
          </div>

          {/* View Toggle */}
          <div className="flex items-center gap-1 rounded-lg border border-brand-lea/15 p-1">
            {viewOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  onClick={() => setView(option.id)}
                  className={clsx(
                    "flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm font-semibold transition",
                    view === option.id ? "bg-brand-lea text-white" : "text-brand-grey hover:text-brand-lea"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statLabels.map(([key, label]) => (
          <div key={key} className="rounded-xl bg-white p-3 shadow-panel ring-1 ring-brand-lea/10">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-grey">{label}</div>
            <div className="mt-1 text-xl font-semibold text-brand-lea">{data.stats[key]}</div>
            <div className="mt-2 h-1 rounded-full bg-brand-gold/25">
              <div className="h-1 w-2/3 rounded-full bg-brand-sweet" />
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[420px_1fr]">
        {/* Left column: Upcoming + Schedule Form */}
        <div className="space-y-4" id="schedule-form">
          <UpcomingInterviews interviews={data.interviews} onInterviewClick={handleInterviewClick} />
          <ScheduleInterviewForm candidates={data.candidates} jobs={data.jobs} prefilledDate={prefilledDate} />
        </div>

        {/* Right column: Calendar views */}
        <div className="min-w-0">
          {view === "month" && (
            <MonthCalendar
              interviews={data.interviews}
              onDayClick={handleDayClick}
              onInterviewClick={handleInterviewClick}
              onReschedule={handleReschedule}
            />
          )}

          {view === "week" && (
            <TimeGridCalendar
              interviews={data.interviews}
              mode="week"
              onSlotClick={handleDayClick}
              onInterviewClick={handleInterviewClick}
              onReschedule={handleReschedule}
            />
          )}

          {view === "day" && (
            <TimeGridCalendar
              interviews={data.interviews}
              mode="day"
              onSlotClick={handleDayClick}
              onInterviewClick={handleInterviewClick}
              onReschedule={handleReschedule}
            />
          )}

          {view === "list" && (
            <section className="rounded-xl bg-white shadow-panel ring-1 ring-brand-lea/10">
              <div className="border-b border-brand-lea/10 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">Interview manifest</p>
                <h2 className="text-base font-semibold text-brand-lea">All interviews</h2>
              </div>
              <div className="p-4">
                {data.interviews.length > 0 ? (
                  <div className="space-y-3">
                    {data.interviews.map((interview) => (
                      <article
                        key={interview.id}
                        className="cursor-pointer rounded-lg border border-brand-lea/10 bg-brand-cloudDancer/45 p-4 transition hover:border-brand-sweet hover:bg-brand-sweet/10"
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
                              {[interview.candidate.currentTitle, interview.job?.title].filter(Boolean).join(" · ")}
                            </div>
                            {/* Contact chips */}
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {interview.candidate.email && (
                                <a
                                  href={`mailto:${interview.candidate.email}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-brand-lea ring-1 ring-brand-lea/10 hover:bg-brand-sweet/20"
                                >
                                  <Mail className="h-3 w-3" /> {interview.candidate.email}
                                </a>
                              )}
                              {interview.candidate.phone && (
                                <a
                                  href={`tel:${interview.candidate.phone}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-brand-lea ring-1 ring-brand-lea/10 hover:bg-brand-sweet/20"
                                >
                                  <Phone className="h-3 w-3" /> {interview.candidate.phone}
                                </a>
                              )}
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
                            {formatDateTimeWithZone(interview.startDateTime, interview.timezone)}
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
                  <div className="rounded-lg border border-brand-lea/10 bg-brand-cloudDancer/45 p-8 text-center">
                    <div className="text-lg font-semibold text-brand-lea">No interviews scheduled yet</div>
                    <p className="mt-2 text-sm text-brand-grey">Use the schedule form to add a candidate interview.</p>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
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
