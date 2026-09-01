"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CalendarRange, Square, GanttChartSquare, Building2, Palette } from "lucide-react";
import { clsx } from "clsx";
import type { CalendarData } from "@/lib/data/calendar";
import { DEPARTMENTS, resolveDepartmentKey, DEFAULT_DEPARTMENT_COLOR_META, type ColorMeta, type DeptKey } from "@/lib/calendar/departments";
import { DepartmentColorEditor } from "@/components/calendar/DepartmentColorEditor";
import { ScheduleInterviewForm, interviewStatusLabel } from "@/components/calendar/ScheduleInterviewForm";
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
// The calendar itself and the Schedule-interview form are NO LONGER grid panels —
// they render below the grid in ordinary page flow. Read this before adding them
// back.
//
// A react-grid-layout item is an absolute pixel slot (h * rowHeight 28 plus 12px
// gaps), so h:18 meant 708px whatever was inside it. MonthCalendar's natural
// height is roughly 790-850px (header + weekday row + six rows at min-h-[110px] +
// legend) and grows with events per day; the week grid is 784px before it widens
// for an early or late interview; ScheduleInterviewForm is a long multi-field
// form. All three exceeded the slot by design, so the choice inside the grid was
// only ever "overlap the panels below" or "a second scrollbar over the calendar".
// Out of the grid there is no cap and no inner scrollbar, and the page scrolls.
//
// The ids below carry a -v2 suffix, and that is load-bearing rather than cosmetic.
// A saved layout was live for this page (WorkspaceSetting scope "page-layout", key
// "calendar") that positioned cal-google at y:38, BELOW the calendar and the form.
// Removing those two panels while keeping the old ids would have left about 1500px
// of blank grid above it. EditableGrid falls back to defaultLayout for any id the
// saved layout does not mention, so renaming the survivors re-lays the page out
// from these defaults exactly once. The stale entries are simply ignored.
const CALENDAR_DEFAULT_LAYOUT: GridItem[] = [
  { i: "cal-header-v2", x: 0, y: 0, w: 5, h: 5 },
  { i: "cal-stats-v2", x: 5, y: 0, w: 7, h: 5 },
  { i: "cal-upcoming-v2", x: 0, y: 5, w: 4, h: 8 },
  { i: "cal-list-v2", x: 4, y: 5, w: 4, h: 8 },
  { i: "cal-google-v2", x: 8, y: 5, w: 4, h: 8 }
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
      return "bg-blue-100 dark:bg-sky-500/15 text-blue-800 dark:text-sky-300";
    case "COMPLETED":
      return "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
    case "CANCELLED":
      return "bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-300";
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
    <section className="flex h-full flex-col overflow-hidden rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
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
              className="block w-full rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-2 text-left transition-shadow hover:shadow-glow dark:border-white/10 dark:bg-white/5"
            >
              <div className="truncate text-xs font-semibold text-brand-lea dark:text-slate-100">{interview.candidate.displayName}</div>
              <div className="truncate text-[11px] text-brand-grey dark:text-slate-400">{interview.title}</div>
              <div className="mt-1 flex items-center justify-between gap-1">
                <span className="min-w-0 truncate text-[10px] text-brand-grey dark:text-slate-400">
                  {formatDateTimeWithZone(interview.startDateTime, interview.timezone)}
                </span>
                <span className={clsx("shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold", statusBadgeColor(interview.status))}>
                  {interviewStatusLabel(interview.status)}
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
  // Optimistic drag-to-reschedule: the new times we have asked the server for but
  // not yet had confirmed, keyed by interview id. Rendering these immediately is
  // what makes a drop stick where it was dropped instead of snapping back while
  // the PATCH is in flight.
  const [pendingMoves, setPendingMoves] = useState<Record<string, { startDateTime: string; endDateTime: string | null }>>({});
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  // Fresh server data supersedes anything we were showing optimistically (the
  // edit modal refreshes the route after a save). Bails out when there is
  // nothing pending so this does not cause a render on mount.
  useEffect(() => {
    setPendingMoves((current) => (Object.keys(current).length > 0 ? {} : current));
  }, [data.interviews]);

  // Every panel reads interviews through here, so a moved card is consistent
  // across the calendar, the upcoming rail and the manifest list at once.
  const interviews = useMemo(
    () => data.interviews.map((interview) => (pendingMoves[interview.id] ? { ...interview, ...pendingMoves[interview.id] } : interview)),
    [data.interviews, pendingMoves]
  );

  // Build the filter options from the interviews actually on the calendar rather
  // than from the full DEPARTMENTS taxonomy. The taxonomy is a deliberate superset
  // (it fixes the colors and the sub-group structure), but plenty of it matches no
  // real data — nothing currently resolves to Crew/Cabin, FBO/SVR, FBO/DVO or
  // Support/SkyOps. Listing those would reproduce the exact complaint this filter
  // is meant to fix: pick a department, get an empty calendar. Counts are shown so
  // it is obvious what each option will yield before you pick it.
  const departmentOptions = useMemo(() => {
    const deptCounts = new Map<DeptKey, number>();
    const subCounts = new Map<string, number>();

    for (const interview of data.interviews) {
      const { deptKey, subKey } = resolveDepartmentKey(interview.department);
      deptCounts.set(deptKey, (deptCounts.get(deptKey) ?? 0) + 1);
      if (subKey) {
        const composite = `${deptKey}:${subKey}`;
        subCounts.set(composite, (subCounts.get(composite) ?? 0) + 1);
      }
    }

    const departments = DEPARTMENTS.map((dept) => {
      const count = deptCounts.get(dept.key) ?? 0;
      const subs = dept.subs
        .map((sub) => ({ ...sub, count: subCounts.get(`${dept.key}:${sub.key}`) ?? 0 }))
        .filter((sub) => sub.count > 0);
      // A lone sub-group covering the whole department is just the department
      // again under another name — don't offer the drill-down in that case.
      return { ...dept, count, subs: subs.length === 1 && subs[0].count === count ? [] : subs };
    }).filter((dept) => dept.count > 0);

    return { departments, unassignedCount: deptCounts.get("unassigned") ?? 0 };
  }, [data.interviews]);

  // Filter values: "all" | "dept:<key>" | "sub:<dept>:<sub>" | "unassigned".
  const filteredInterviews = useMemo(() => {
    if (department === "all") return interviews;
    return interviews.filter((interview) => {
      const { deptKey, subKey } = resolveDepartmentKey(interview.department);
      if (department === "unassigned") return deptKey === "unassigned";
      if (department.startsWith("dept:")) return deptKey === department.slice(5);
      if (department.startsWith("sub:")) {
        const [, parent, sub] = department.split(":");
        return deptKey === parent && subKey === sub;
      }
      return true;
    });
  }, [interviews, department]);

  const handleDayClick = useCallback((date: Date) => {
    setPrefilledDate(date);
    document.getElementById("schedule-form")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleInterviewClick = useCallback((interview: Interview) => {
    setEditingInterview(interview);
  }, []);

  // Drag-to-reschedule. Month drops keep the original time-of-day; week/day drops
  // use the exact dropped slot (date + hour).
  //
  // This used to move nothing until the PATCH came back, and did nothing at all
  // when it failed: the card snapped back to where it started, which is EXACTLY
  // what a missed drop looks like. A rejected reschedule therefore read as a
  // clumsy drag and got retried instead of reported. It is now optimistic — the
  // card moves on drop — and a failure rolls it back with the reason on screen.
  const handleReschedule = useCallback(
    async (interviewId: string, newDate: Date, options?: { keepOriginalTime?: boolean }) => {
      const interview = interviews.find((i) => i.id === interviewId);
      if (!interview) return;

      const oldStart = new Date(interview.startDateTime);
      const newStart = new Date(newDate);
      if (options?.keepOriginalTime) {
        newStart.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0);
      }

      // Compute duration to preserve it
      const oldEnd = interview.endDateTime ? new Date(interview.endDateTime) : null;
      const durationMinutes = oldEnd ? Math.round((oldEnd.getTime() - oldStart.getTime()) / 60000) : 60;
      const newEnd = new Date(newStart.getTime() + durationMinutes * 60000);

      const pad = (n: number) => String(n).padStart(2, "0");
      const startDateTime = `${newStart.getFullYear()}-${pad(newStart.getMonth() + 1)}-${pad(newStart.getDate())}T${pad(newStart.getHours())}:${pad(newStart.getMinutes())}`;

      // What to put back if the server says no. Usually "no override at all",
      // but a second drag before the first settles has one to restore.
      const previous = pendingMoves[interviewId] ?? null;
      setRescheduleError(null);
      setPendingMoves((current) => ({
        ...current,
        [interviewId]: { startDateTime: newStart.toISOString(), endDateTime: newEnd.toISOString() }
      }));

      try {
        const response = await fetch(`/api/interviews/${interviewId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDateTime, durationMinutes })
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message ?? "That interview couldn't be moved. It's back where it was.");
        }
        // The refresh stays, but it is no longer what MOVES the card — the card
        // is already where it was dropped, so nobody waits on this. It is here
        // because the server does not necessarily store the instant the browser
        // computed: the PATCH body carries a naive local string that the API
        // parses with new Date() in the SERVER's timezone. Dropping the refresh
        // would hide any such normalisation until the next full page load. The
        // optimistic entry is held until the fresh props land (see the effect
        // above), so this does not flash the card back on the way.
        router.refresh();
      } catch (error) {
        setPendingMoves((current) => {
          const next = { ...current };
          if (previous) {
            next[interviewId] = previous;
          } else {
            delete next[interviewId];
          }
          return next;
        });
        setRescheduleError(
          error instanceof Error ? error.message : "That interview couldn't be moved. It's back where it was."
        );
      }
    },
    [interviews, pendingMoves, router]
  );

  // Memoized (along with the two panels below it) so the panels array handed to
  // EditableGrid is stable across re-renders that do not change what is on it.
  const headerPanel = useMemo(
    () => (
    <section className="flex h-full flex-col rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Interview operations</p>
          <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Calendar</h1>
          <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
            Schedule and manage candidate interviews. Click a day or time to schedule, click an interview to edit, or drag to reschedule.
          </p>
          {/* A rejected reschedule has to say so — the card rolling back on its
              own is indistinguishable from a drag that missed. */}
          {rescheduleError && (
            <div
              role="alert"
              className="mt-2 flex items-start justify-between gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
            >
              <span>{rescheduleError}</span>
              <button
                type="button"
                onClick={() => setRescheduleError(null)}
                aria-label="Dismiss"
                className="shrink-0 rounded px-1 text-red-700/70 transition hover:text-red-700 dark:text-red-300/70 dark:hover:text-red-300"
              >
                ×
              </button>
            </div>
          )}
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
              <option value="all">All departments ({data.interviews.length})</option>
              {departmentOptions.departments.map((dept) =>
                dept.subs.length === 0 ? (
                  <option key={dept.key} value={`dept:${dept.key}`}>
                    {dept.label} ({dept.count})
                  </option>
                ) : (
                  <optgroup key={dept.key} label={dept.label}>
                    <option value={`dept:${dept.key}`}>
                      {dept.label} — all ({dept.count})
                    </option>
                    {dept.subs.map((sub) => (
                      <option key={sub.key} value={`sub:${dept.key}:${sub.key}`}>
                        {sub.label} ({sub.count})
                      </option>
                    ))}
                  </optgroup>
                )
              )}
              {departmentOptions.unassignedCount > 0 && (
                <option value="unassigned">Unassigned ({departmentOptions.unassignedCount})</option>
              )}
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
    ),
    [data.interviews.length, departmentOptions, department, colorMode, canEdit, view, rescheduleError]
  );

  // The meter that used to sit under each number is gone. It was a hardcoded
  // w-2/3 bar inside the .map(), so all four tiles read 67% whatever the counts
  // were — decoration shaped like data, which is worse than no chart at all.
  // The tile is now just its label and its number.
  const statsPanel = useMemo(
    () => (
      <section className="grid h-full content-start gap-3 grid-cols-[repeat(auto-fit,minmax(120px,1fr))]">
        {statLabels.map(([key, label]) => (
          <div key={key} className="rounded bg-white p-3 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-grey dark:text-slate-400">{label}</div>
            <div className="mt-1 text-xl font-semibold text-brand-lea dark:text-slate-100">{data.stats[key]}</div>
          </div>
        ))}
      </section>
    ),
    [data.stats]
  );

  // The overflow-auto that used to be here is gone, and so is the h-full it went
  // with. Both existed only to contain this inside a 708px grid slot; the panel is
  // no longer in the grid, so it grows to the month/week/timeline it is showing and
  // the page scrolls. min-w-0 stays — it is the flex/grid min-content guard, not an
  // overflow.
  const calendarPanel = useMemo(
    () => (
    <div className="min-w-0">
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
    ),
    [view, filteredInterviews, colorMode, departmentColors, data.teamHosts, handleDayClick, handleInterviewClick, handleReschedule]
  );

  // Memoized so EditableGrid gets a stable array. This component holds eight
  // pieces of state (view, department, colour mode, the reschedule error…), and a
  // fresh panels array on every one of those re-renders used to reset the saved
  // grid layout. See the matching note in EditableGrid.
  const panels: EditablePanel[] = useMemo(
    () => [
      { id: "cal-header-v2", title: "Interview operations", node: headerPanel },
      { id: "cal-stats-v2", title: "Interview statistics", node: statsPanel },
      { id: "cal-upcoming-v2", title: "Upcoming interviews", node: <UpcomingInterviews interviews={filteredInterviews} onInterviewClick={handleInterviewClick} /> },
      { id: "cal-list-v2", title: "All interviews", node: <CompactInterviewList interviews={filteredInterviews} onInterviewClick={handleInterviewClick} /> },
      { id: "cal-google-v2", title: "Google sync", node: <GoogleSyncCard sync={data.sync} /> }
    ],
    [headerPanel, statsPanel, filteredInterviews, handleInterviewClick, data.sync]
  );

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

      {/* The schedule form and the calendar sit OUTSIDE the grid — see
          CALENDAR_DEFAULT_LAYOUT. Side by side from xl, stacked below it, and
          neither column caps its own height, so a full month, a full week and the
          timeline all render whole. */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(320px,1fr)_minmax(0,2.2fr)]">
        <div id="schedule-form" className="min-w-0">
          <ScheduleInterviewForm candidates={data.candidates} jobs={data.jobs} interviewers={data.interviewers} prefilledDate={prefilledDate} />
        </div>
        {calendarPanel}
      </div>

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
