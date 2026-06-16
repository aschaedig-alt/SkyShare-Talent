"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CalendarRange, Square, GanttChartSquare } from "lucide-react";
import { clsx } from "clsx";
import type { CalendarData } from "@/lib/data/calendar";
import { ScheduleInterviewForm } from "@/components/calendar/ScheduleInterviewForm";
import { MonthCalendar } from "@/components/calendar/MonthCalendar";
import { TimeGridCalendar } from "@/components/calendar/TimeGridCalendar";
import { ScheduleTimeline } from "@/components/calendar/ScheduleTimeline";
import { EditInterviewModal } from "@/components/calendar/EditInterviewModal";
import { UpcomingInterviews } from "@/components/calendar/UpcomingInterviews";
import { GoogleSyncCard } from "@/components/calendar/GoogleSyncCard";
import { formatDateTimeWithZone } from "@/lib/calendar/format";
import { EditableGrid, type EditablePanel, type GridItem } from "@/components/shared/EditableGrid";
import type { WidgetInstance } from "@/lib/data/page-layout";
import type { WidgetData } from "@/components/widgets/registry";

type CalendarWorkspaceProps = {
  data: CalendarData;
  canEdit?: boolean;
  savedLayout?: GridItem[] | null;
  savedWidgets?: WidgetInstance[] | null;
  widgetData?: WidgetData;
};

type Interview = CalendarData["interviews"][number];
type ViewMode = "month" | "week" | "day" | "timeline" | "list";

// Default arrangement (12-col grid) used until an admin saves a custom layout.
const CALENDAR_DEFAULT_LAYOUT: GridItem[] = [
  { i: "cal-header", x: 0, y: 0, w: 5, h: 5 },
  { i: "cal-stats", x: 5, y: 0, w: 7, h: 5 },
  { i: "cal-upcoming", x: 0, y: 5, w: 3, h: 6 },
  { i: "cal-list", x: 0, y: 11, w: 3, h: 8 },
  { i: "cal-google", x: 0, y: 19, w: 3, h: 4 },
  { i: "cal-schedule", x: 3, y: 5, w: 3, h: 18 },
  { i: "cal-calendar", x: 6, y: 5, w: 6, h: 18 }
];

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

// "List" is no longer a toggle option — the interviews list now lives as a persistent
// compact panel in the left rail (per the Layout Lab arrangement).
const viewOptions: Array<{ id: ViewMode; label: string; icon: typeof CalendarDays }> = [
  { id: "month", label: "Month", icon: CalendarDays },
  { id: "week", label: "Week", icon: CalendarRange },
  { id: "day", label: "Day", icon: Square },
  { id: "timeline", label: "Timeline", icon: GanttChartSquare }
];

// Compact, rail-width list of every interview (the wide manifest cards do not fit a
// narrow column, so this is a condensed version that still opens the edit modal).
function CompactInterviewList({
  interviews,
  onInterviewClick
}: {
  interviews: Interview[];
  onInterviewClick: (interview: Interview) => void;
}) {
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-xl bg-white shadow-panel ring-1 ring-brand-lea/10">
      <div className="shrink-0 border-b border-brand-lea/10 px-4 py-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">Interview manifest</p>
        <h2 className="text-base font-semibold text-brand-lea">All interviews</h2>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {interviews.length > 0 ? (
          interviews.map((interview) => (
            <button
              key={interview.id}
              type="button"
              onClick={() => onInterviewClick(interview)}
              className="block w-full rounded-lg border border-brand-lea/10 bg-brand-cloudDancer/45 p-2 text-left transition hover:border-brand-sweet hover:bg-brand-sweet/10"
            >
              <div className="truncate text-xs font-semibold text-brand-lea">{interview.candidate.displayName}</div>
              <div className="truncate text-[11px] text-brand-grey">{interview.title}</div>
              <div className="mt-1 flex items-center justify-between gap-1">
                <span className="truncate text-[10px] text-brand-grey">
                  {formatDateTimeWithZone(interview.startDateTime, interview.timezone)}
                </span>
                <span className={clsx("shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold", statusBadgeColor(interview.status))}>
                  {interview.status}
                </span>
              </div>
            </button>
          ))
        ) : (
          <p className="p-2 text-xs text-brand-grey">No interviews scheduled yet.</p>
        )}
      </div>
    </section>
  );
}

export function CalendarWorkspace({ data, canEdit = false, savedLayout = null, savedWidgets = null, widgetData }: CalendarWorkspaceProps) {
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

  const headerPanel = (
    <section className="flex h-full flex-col rounded-xl bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Interview operations</p>
          <h1 className="text-2xl font-semibold text-brand-lea">Calendar</h1>
          <p className="mt-1 text-sm text-brand-grey">
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
  );

  const statsPanel = (
    <section className="grid h-full grid-cols-2 gap-3 sm:grid-cols-4">
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
  );

  const calendarPanel = (
    <div className="h-full min-w-0">
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
      {view === "timeline" && (
        <ScheduleTimeline
          interviews={data.interviews}
          teamHosts={data.teamHosts}
          onInterviewClick={handleInterviewClick}
          onReschedule={handleReschedule}
        />
      )}
    </div>
  );

  const panels: EditablePanel[] = [
    { id: "cal-header", title: "Interview operations", node: headerPanel },
    { id: "cal-stats", title: "Interview statistics", node: statsPanel },
    { id: "cal-upcoming", title: "Upcoming interviews", node: <UpcomingInterviews interviews={data.interviews} onInterviewClick={handleInterviewClick} /> },
    { id: "cal-list", title: "All interviews", node: <CompactInterviewList interviews={data.interviews} onInterviewClick={handleInterviewClick} /> },
    { id: "cal-google", title: "Google sync", node: <GoogleSyncCard sync={data.sync} /> },
    {
      id: "cal-schedule",
      title: "Schedule interview",
      node: (
        <div id="schedule-form" className="h-full">
          <ScheduleInterviewForm candidates={data.candidates} jobs={data.jobs} prefilledDate={prefilledDate} />
        </div>
      )
    },
    { id: "cal-calendar", title: "Calendar", node: calendarPanel }
  ];

  return (
    <div className="px-5 py-5 lg:px-8">
      <EditableGrid
        pageKey="calendar"
        panels={panels}
        defaultLayout={CALENDAR_DEFAULT_LAYOUT}
        savedLayout={savedLayout}
        savedWidgets={savedWidgets}
        canEdit={canEdit}
        widgetData={widgetData}
      />

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
