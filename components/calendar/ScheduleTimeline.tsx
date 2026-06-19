"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { clsx } from "clsx";
import type { CalendarData } from "@/lib/data/calendar";
import { formatTime } from "@/lib/calendar/format";
import { interviewTypeMeta } from "@/lib/calendar/interview-types";
import { resolveDepartmentKey, DEFAULT_DEPARTMENT_COLOR_META, type ColorMeta, type DeptKey } from "@/lib/calendar/departments";
import { CalendarLegend } from "@/components/calendar/CalendarLegend";

type Interview = CalendarData["interviews"][number];
type ColorMode = "department" | "stage";

interface ScheduleTimelineProps {
  interviews: Interview[];
  colorMode?: ColorMode;
  departmentColors?: Record<DeptKey, ColorMeta>;
  teamHosts?: Array<{ name: string; avatarUrl: string | null }>;
  onInterviewClick?: (interview: Interview) => void;
  onReschedule?: (interviewId: string, newDate: Date, options?: { keepOriginalTime?: boolean }) => void;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Layout constants (px). The day track scrolls horizontally; the team rail is sticky.
const DAY_WIDTH = 46;
const RAIL_WIDTH = 208;
const BAR_HEIGHT = 30;
const LANE_GAP = 4;
const ROW_PAD = 10;

const UNASSIGNED = "Unassigned";

// Deterministic avatar palette — picked by hashing the team member's name so each
// person keeps a stable color across renders without needing stored avatar URLs.
const AVATAR_COLORS = [
  "bg-blue-500", "bg-purple-500", "bg-emerald-500", "bg-orange-500",
  "bg-rose-500", "bg-cyan-600", "bg-amber-500", "bg-indigo-500",
  "bg-teal-500", "bg-fuchsia-500"
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function TeamAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  const isUnassigned = name === UNASSIGNED;
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt={name} className="h-8 w-8 shrink-0 rounded-full object-cover shadow-sm ring-1 ring-brand-lea/15" />;
  }
  const color = isUnassigned ? "bg-slate-300 text-slate-600" : `${AVATAR_COLORS[hashString(name) % AVATAR_COLORS.length]} text-white`;
  return (
    <span className={clsx("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold shadow-sm", color)}>
      {isUnassigned ? "—" : initials(name)}
    </span>
  );
}

function barClasses(interview: Interview, colorMode: ColorMode, departmentColors: Record<DeptKey, ColorMeta>) {
  if (interview.status === "CANCELLED") {
    return "bg-slate-300 text-slate-600 line-through";
  }
  const meta =
    colorMode === "department"
      ? departmentColors[resolveDepartmentKey(interview.job?.department ?? null).deptKey]
      : interviewTypeMeta(interview.interviewType);
  const completed = interview.status === "COMPLETED" ? "opacity-60" : "";
  return `${meta.chip} ${completed}`;
}

type Placement = { interview: Interview; startDay: number; endDay: number; lane: number };

// First-fit lane packing by day range so overlapping interviews in one row stack
// vertically instead of colliding.
function packLanes(items: Array<{ interview: Interview; startDay: number; endDay: number }>) {
  const sorted = [...items].sort((a, b) => a.startDay - b.startDay || a.endDay - b.endDay);
  const laneEnds: number[] = [];
  const placements: Placement[] = [];
  for (const item of sorted) {
    let lane = laneEnds.findIndex((end) => item.startDay > end);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.endDay);
    } else {
      laneEnds[lane] = item.endDay;
    }
    placements.push({ ...item, lane });
  }
  return { placements, laneCount: Math.max(1, laneEnds.length) };
}

export function ScheduleTimeline({
  interviews,
  colorMode = "department",
  departmentColors = DEFAULT_DEPARTMENT_COLOR_META,
  teamHosts,
  onInterviewClick,
  onReschedule
}: ScheduleTimelineProps) {
  // Match an interviewer name to a booking host's photo (case-insensitive).
  const avatarByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const host of teamHosts ?? []) {
      if (host.avatarUrl) map.set(host.name.trim().toLowerCase(), host.avatarUrl);
    }
    return map;
  }, [teamHosts]);
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const today = new Date();
  const todayDay = today.getFullYear() === year && today.getMonth() === month ? today.getDate() : null;

  // Group this month's interviews by team member (interviewer), then lane-pack each row.
  const rows = useMemo(() => {
    const byMember = new Map<string, Array<{ interview: Interview; startDay: number; endDay: number }>>();
    for (const interview of interviews) {
      const start = new Date(interview.startDateTime);
      if (start.getFullYear() !== year || start.getMonth() !== month) continue;
      const member = interview.interviewer?.trim() || UNASSIGNED;
      const startDay = start.getDate();
      // Clamp a multi-day interview's end to this month; default to a single-day bar.
      let endDay = startDay;
      if (interview.endDateTime) {
        const end = new Date(interview.endDateTime);
        if (end.getFullYear() === year && end.getMonth() === month) {
          endDay = Math.max(startDay, end.getDate());
        } else if (end > start) {
          endDay = daysInMonth;
        }
      }
      const list = byMember.get(member) ?? [];
      list.push({ interview, startDay, endDay });
      byMember.set(member, list);
    }

    return Array.from(byMember.entries())
      .sort(([a], [b]) => {
        if (a === UNASSIGNED) return 1;
        if (b === UNASSIGNED) return -1;
        return a.localeCompare(b);
      })
      .map(([member, items]) => ({ member, count: items.length, ...packLanes(items) }));
  }, [interviews, year, month, daysInMonth]);

  function goToPrevMonth() {
    setViewDate(new Date(year, month - 1, 1));
  }
  function goToNextMonth() {
    setViewDate(new Date(year, month + 1, 1));
  }
  function goToToday() {
    const now = new Date();
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
  }

  function handleDrop(day: number) {
    if (draggingId && onReschedule) {
      onReschedule(draggingId, new Date(year, month, day), { keepOriginalTime: true });
    }
    setDraggingId(null);
    setDragOverDay(null);
  }

  const trackWidth = daysInMonth * DAY_WIDTH;

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-xl bg-white shadow-panel ring-1 ring-brand-lea/10">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-brand-lea/10 px-4 py-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">Team schedule</p>
          <h2 className="text-lg font-semibold text-brand-lea">{MONTHS[month]} {year}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={goToToday}
            className="rounded-lg border border-brand-lea/20 px-3 py-1 text-xs font-semibold text-brand-lea hover:bg-brand-cloudDancer/30"
          >
            Today
          </button>
          <button onClick={goToPrevMonth} className="rounded-lg border border-brand-lea/20 p-1 text-brand-lea hover:bg-brand-cloudDancer/30" aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={goToNextMonth} className="rounded-lg border border-brand-lea/20 p-1 text-brand-lea hover:bg-brand-cloudDancer/30" aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Scrollable timeline */}
      <div className="min-h-0 flex-1 overflow-auto">
        <div style={{ width: RAIL_WIDTH + trackWidth }}>
          {/* Day axis header */}
          <div className="sticky top-0 z-20 flex border-b border-brand-lea/10 bg-white">
            <div
              className="sticky left-0 z-10 flex items-center border-r border-brand-lea/10 bg-white px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey"
              style={{ width: RAIL_WIDTH }}
            >
              Recruiting team
            </div>
            <div className="flex">
              {days.map((day) => {
                const weekday = new Date(year, month, day).getDay();
                const isWeekend = weekday === 0 || weekday === 6;
                const isToday = day === todayDay;
                return (
                  <div
                    key={day}
                    className={clsx(
                      "flex flex-col items-center justify-center border-r border-brand-lea/5 py-1.5",
                      isWeekend && "bg-brand-cloudDancer/30",
                      isToday && "bg-brand-lea/5"
                    )}
                    style={{ width: DAY_WIDTH }}
                  >
                    <span
                      className={clsx(
                        "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                        isToday ? "bg-brand-lea text-white" : "text-brand-lea"
                      )}
                    >
                      {day}
                    </span>
                    <span className="text-[9px] uppercase tracking-wide text-brand-grey">{WEEKDAYS[weekday]}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Team rows */}
          {rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-brand-grey">
              No interviews scheduled in {MONTHS[month]}.
            </div>
          ) : (
            rows.map((row) => {
              const rowHeight = row.laneCount * (BAR_HEIGHT + LANE_GAP) - LANE_GAP + ROW_PAD * 2;
              return (
                <div key={row.member} className="flex border-b border-brand-lea/5">
                  {/* Sticky team rail */}
                  <div
                    className="sticky left-0 z-10 flex items-center gap-2.5 border-r border-brand-lea/10 bg-white px-4"
                    style={{ width: RAIL_WIDTH }}
                  >
                    <TeamAvatar name={row.member} avatarUrl={avatarByName.get(row.member.trim().toLowerCase())} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-brand-lea">{row.member}</div>
                      <div className="text-[11px] text-brand-grey">{row.count} interview{row.count === 1 ? "" : "s"}</div>
                    </div>
                  </div>

                  {/* Day track */}
                  <div className="relative" style={{ width: trackWidth, height: rowHeight }}>
                    {/* Drop columns + gridlines (behind bars) */}
                    <div className="absolute inset-0 flex">
                      {days.map((day) => {
                        const weekday = new Date(year, month, day).getDay();
                        const isWeekend = weekday === 0 || weekday === 6;
                        return (
                          <div
                            key={day}
                            onDragOver={(e) => {
                              if (draggingId) {
                                e.preventDefault();
                                setDragOverDay(day);
                              }
                            }}
                            onDragLeave={() => setDragOverDay((d) => (d === day ? null : d))}
                            onDrop={() => handleDrop(day)}
                            className={clsx(
                              "border-r border-brand-lea/5",
                              isWeekend && "bg-brand-cloudDancer/20",
                              day === todayDay && "bg-brand-lea/[0.04]",
                              dragOverDay === day && "bg-brand-gold/20 ring-2 ring-inset ring-brand-gold"
                            )}
                            style={{ width: DAY_WIDTH }}
                          />
                        );
                      })}
                    </div>

                    {/* Interview bars */}
                    {row.placements.map(({ interview, startDay, endDay, lane }) => {
                      const left = (startDay - 1) * DAY_WIDTH + 2;
                      const width = (endDay - startDay + 1) * DAY_WIDTH - 4;
                      const top = ROW_PAD + lane * (BAR_HEIGHT + LANE_GAP);
                      return (
                        <button
                          key={interview.id}
                          draggable={interview.status !== "CANCELLED"}
                          onDragStart={() => setDraggingId(interview.id)}
                          onDragEnd={() => {
                            setDraggingId(null);
                            setDragOverDay(null);
                          }}
                          onClick={() => onInterviewClick?.(interview)}
                          title={`${formatTime(interview.startDateTime, interview.timezone)} · ${interview.candidate.displayName}${interview.job ? ` (${interview.job.title})` : ""}`}
                          className={clsx(
                            "absolute flex items-center gap-1.5 overflow-hidden rounded-md px-2 text-left text-[11px] font-medium shadow-sm transition hover:shadow-md hover:shadow-glow",
                            barClasses(interview, colorMode, departmentColors),
                            draggingId === interview.id && "opacity-40"
                          )}
                          style={{ left, width, top, height: BAR_HEIGHT }}
                        >
                          <span className="shrink-0 font-semibold tabular-nums">{formatTime(interview.startDateTime, interview.timezone)}</span>
                          <span className="truncate">{interview.candidate.displayName}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Legend + hint */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-brand-lea/10 px-4 py-3 text-xs text-brand-grey">
        <CalendarLegend mode={colorMode} departmentColors={departmentColors} />
        <span className="hidden italic text-brand-grey/70 sm:inline">Drag a bar to another day to reschedule</span>
      </div>
    </section>
  );
}
