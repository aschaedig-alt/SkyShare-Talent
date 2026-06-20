"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CalendarRange, Square, GanttChartSquare, Building2, Palette } from "lucide-react";
import { clsx } from "clsx";
import type { CalendarData } from "@/lib/data/calendar";
import { DEPARTMENTS, resolveDepartmentKey, DEFAULT_DEPARTMENT_COLOR_META, type ColorMeta, type DeptKey } from "@/lib/calendar/departments";
import { DepartmentColorEditor } from "@/components/calendar/DepartmentColorEditor";
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
  departmentColors?: Record<DeptKey, ColorMeta>;
  savedLayout?: GridItem[] | null;
  savedWidgets?: WidgetInstance[] | null;
  widgetData?: WidgetData;
};

type Interview = CalendarData["interviews"][number];
type ViewMode = "month" | "week" | "day" | "timeline" | "list";
type ColorMode = "department" | "stage";

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
      return "bg-brand-sweet/25 text-brand-lea dark:text-slate-100";
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
    <section className="flex h-full flex-col overflow-hidden rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
      <div className="shrink-0 border-b border-brand-lea/10 px-4 py-3 dark:border-white/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">Interview manifest</p>
        <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">All interviews</h2>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {interviews.length > 0 ? (
          interviews.map((interview) => (
            <button
              key={interview.id}
              type="button"
              onClick={() => onInterviewClick(interview)}
              className="block w-full rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-2 text-left transition hover:border-brand-sweet hover:bg-brand-sweet/10 hover:shadow-glow dark:border-white/10 dark:bg-white/5"
            >
              <div className="truncate text-xs font-semibold text-brand-lea dark:text-slate-100">{interview.candidate.displayName}</div>
              <div className="truncate text-[11px] text-brand-grey dark:text-slate-400">{interview.title}</div>
              <div className="mt-1 flex items-center justify-between gap-1">
                <span className="min-w-0 truncate text-[10px] text-brand-grey dark:text-slate-400">
                  {formatDateTimeWithZone(interview.startDateTime, interview.timezone)}
                </span>
                <span className={clsx("shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold", statusBadgeColor(interview.status))}>
                  {interview.status}
                </span>
              </div>
            </button>
          ))
        ) : (
          <p className="p-2 text-xs text-brand-grey dark:text-slate-400">No interviews scheduled yet.</p>
        )}
      </div>
    </section>
  );
}

export function CalendarWorkspace({
  data,
  canEdit = false,
  departmentColors = DEFAULT_DEPARTMENT_COLOR_META,
  savedLayout = null,
  savedWidgets = null,
  widgetData
}: CalendarWorkspaceProps) {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("month");
  const [department, setDepartment] = useState<string>("all");
  const [colorMode, setColorMode] = useState<ColorMode>("department");
  const [colorEditorOpen, setColorEditorOpen] = useState(false);
  const [editingInterview, setEditingInterview] = useState<Interview | null>(null);
  const [prefilledDate, setPrefilledDate] = useState<Date | null>(null);

  // Whether any interview has no resolvable department, so we only offer the
  // Unassigned filter option when it would actually match something.
  const hasUnassigned = useMemo(
    () => data.interviews.some((interview) => resolveDepartmentKey(interview.job?.department ?? null).deptKey === "unassigned"),
    [data.interviews]
  );

  // Filter values: "all" | "dept:<key>" | "sub:<dept>:<sub>" | "unassigned".
  const filteredInterviews = useMemo(() => {
    if (department === "all") return data.interviews;
    return data.interviews.filter((interview) => {
      const { deptKey, subKey } = resolveDepartmentKey(interview.job?.department ?? null);
      if (department === "unassigned") return deptKey === "unassigned";
      if (department.startsWith("dept:")) return deptKey === department.slice(5);
      if (department.startsWith("sub:")) {
        const [, parent, sub] = department.split(":");
        return deptKey === parent && subKey === sub;
      }
      return true;
    });
  }, [data.interviews, department]);

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
    <section className="flex h-full flex-col rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Interview operations</p>
          <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Calendar</h1>
          <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
            Schedule and manage candidate interviews. Click a day or time to schedule, click an interview to edit, or drag to reschedule.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Department filter (drill down into sub-groups) */}
          <label className="flex items-center gap-1.5 rounded border border-brand-lea/15 py-1 pl-2.5 pr-1 text-sm dark:border-white/10">
            <Building2 className="h-4 w-4 shrink-0 text-brand-grey dark:text-slate-400" />
            <span className="sr-only">Filter by department</span>
            <select
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              className="max-w-[12rem] cursor-pointer rounded bg-transparent py-1 pr-1 text-sm font-semibold text-brand-lea outline-none focus:ring-2 focus:ring-brand-gold/40 dark:text-slate-100"
            >
              <option value="all">All departments</option>
              {DEPARTMENTS.map((dept) =>
                dept.subs.length === 0 ? (
                  <option key={dept.key} value={`dept:${dept.key}`}>
                    {dept.label}
                  </option>
                ) : (
                  <optgroup key={dept.key} label={dept.label}>
                    <option value={`dept:${dept.key}`}>{dept.label} — all</option>
                    {dept.subs.map((sub) => (
                      <option key={sub.key} value={`sub:${dept.key}:${sub.key}`}>
                        {sub.label}
                      </option>
                    ))}
                  </optgroup>
                )
              )}
              {hasUnassigned && <option value="unassigned">Unassigned</option>}
            </select>
          </label>

          {/* Color mode: by department (default) or by interview stage */}
          <div className="flex items-center gap-1 rounded border border-brand-lea/15 p-1 dark:border-white/10" title="Color interviews by">
            <Palette className="ml-1 h-4 w-4 shrink-0 text-brand-grey dark:text-slate-400" />
            {(["department", "stage"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setColorMode(mode)}
                className={clsx(
                  "rounded px-2 py-1.5 text-xs font-semibold transition hover:shadow-glow",
                  colorMode === mode ? "bg-brand-lea text-white" : "text-brand-grey hover:text-brand-lea dark:text-slate-400"
                )}
              >
                {mode === "department" ? "Dept" : "Stage"}
              </button>
            ))}
          </div>

          {/* Edit department colors (admins) */}
          {canEdit && (
            <button
              onClick={() => setColorEditorOpen(true)}
              title="Edit department colors"
              className="inline-flex items-center gap-1.5 rounded border border-brand-lea/15 px-2.5 py-1.5 text-xs font-semibold text-brand-grey transition hover:text-brand-lea dark:border-white/10 dark:text-slate-400"
            >
              <Palette className="h-4 w-4" /> Colors
            </button>
          )}

          {/* View Toggle */}
          <div className="flex items-center gap-1 rounded border border-brand-lea/15 p-1 dark:border-white/10">
            {viewOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  onClick={() => setView(option.id)}
                  className={clsx(
                    "flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm font-semibold transition hover:shadow-glow",
                    view === option.id ? "bg-brand-lea text-white" : "text-brand-grey hover:text-brand-lea dark:text-slate-400"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );

  const statsPanel = (
    <section className="grid h-full content-start gap-3 grid-cols-[repeat(auto-fit,minmax(120px,1fr))]">
      {statLabels.map(([key, label]) => (
        <div key={key} className="rounded bg-white p-3 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-grey dark:text-slate-400">{label}</div>
          <div className="mt-1 text-xl font-semibold text-brand-lea dark:text-slate-100">{data.stats[key]}</div>
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
          interviews={filteredInterviews}
          colorMode={colorMode}
          departmentColors={departmentColors}
          onDayClick={handleDayClick}
          onInterviewClick={handleInterviewClick}
          onReschedule={handleReschedule}
        />
      )}
      {view === "week" && (
        <TimeGridCalendar
          interviews={filteredInterviews}
          colorMode={colorMode}
          departmentColors={departmentColors}
          mode="week"
          onSlotClick={handleDayClick}
          onInterviewClick={handleInterviewClick}
          onReschedule={handleReschedule}
        />
      )}
      {view === "day" && (
        <TimeGridCalendar
          interviews={filteredInterviews}
          colorMode={colorMode}
          departmentColors={departmentColors}
          mode="day"
          onSlotClick={handleDayClick}
          onInterviewClick={handleInterviewClick}
          onReschedule={handleReschedule}
        />
      )}
      {view === "timeline" && (
        <ScheduleTimeline
          interviews={filteredInterviews}
          colorMode={colorMode}
          departmentColors={departmentColors}
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
    { id: "cal-upcoming", title: "Upcoming interviews", node: <UpcomingInterviews interviews={filteredInterviews} onInterviewClick={handleInterviewClick} /> },
    { id: "cal-list", title: "All interviews", node: <CompactInterviewList interviews={filteredInterviews} onInterviewClick={handleInterviewClick} /> },
    { id: "cal-google", title: "Google sync", node: <GoogleSyncCard sync={data.sync} /> },
    {
      id: "cal-schedule",
      title: "Schedule interview",
      node: (
        <div id="schedule-form" className="h-full">
          <ScheduleInterviewForm candidates={data.candidates} jobs={data.jobs} interviewers={data.interviewers} prefilledDate={prefilledDate} />
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
          interviewers={data.interviewers}
          onClose={() => setEditingInterview(null)}
          onSaved={() => router.refresh()}
        />
      )}

      {/* Department color editor (admins) */}
      {colorEditorOpen && <DepartmentColorEditor colors={departmentColors} onClose={() => setColorEditorOpen(false)} />}
    </div>
  );
}
