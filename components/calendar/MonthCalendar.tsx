"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { clsx } from "clsx";
import type { CalendarData } from "@/lib/data/calendar";
import { formatTime } from "@/lib/calendar/format";
import { interviewTypeMeta } from "@/lib/calendar/interview-types";
import { StageLegend } from "@/components/calendar/StageLegend";

type Interview = CalendarData["interviews"][number];

interface MonthCalendarProps {
  interviews: Interview[];
  onDayClick?: (date: Date) => void;
  onInterviewClick?: (interview: Interview) => void;
  onReschedule?: (interviewId: string, newDate: Date, options?: { keepOriginalTime?: boolean }) => void;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function chipClasses(interview: Interview) {
  const meta = interviewTypeMeta(interview.interviewType);
  if (interview.status === "CANCELLED") {
    return "bg-slate-300 text-slate-600 hover:bg-slate-400 line-through";
  }
  const completed = interview.status === "COMPLETED" ? "opacity-60" : "";
  return `${meta.chip} ${completed}`;
}

export function MonthCalendar({ interviews, onDayClick, onInterviewClick, onReschedule }: MonthCalendarProps) {
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [popoverDay, setPopoverDay] = useState<string | null>(null);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const startDayOfWeek = firstDayOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

  // Group interviews by day key
  const interviewsByDay = new Map<string, Interview[]>();
  for (const interview of interviews) {
    const d = new Date(interview.startDateTime);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const list = interviewsByDay.get(key) ?? [];
      list.push(interview);
      interviewsByDay.set(key, list);
    }
  }

  const cells: Array<{ day: number | null; key: string }> = [];
  for (let i = 0; i < startDayOfWeek; i += 1) {
    cells.push({ day: null, key: `blank-${i}` });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ day, key: `${year}-${month}-${day}` });
  }

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
      const newDate = new Date(year, month, day);
      onReschedule(draggingId, newDate, { keepOriginalTime: true });
    }
    setDraggingId(null);
    setDragOverKey(null);
  }

  return (
    <section className="rounded-xl bg-white shadow-panel ring-1 ring-brand-lea/10">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-brand-lea/10 px-4 py-3">
        <h2 className="text-lg font-semibold text-brand-lea">
          {MONTHS[month]} {year}
        </h2>
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

      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-brand-lea/10">
        {WEEKDAYS.map((day) => (
          <div key={day} className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey">
            <span className="hidden sm:inline">{day}</span>
            <span className="sm:hidden">{day[0]}</span>
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {cells.map((cell) => {
          if (cell.day === null) {
            return <div key={cell.key} className="min-h-[80px] border-b border-r border-brand-lea/5 bg-brand-cloudDancer/10 sm:min-h-[110px]" />;
          }

          const dayInterviews = interviewsByDay.get(cell.key) ?? [];
          const isToday = cell.key === todayKey;
          const cellDate = new Date(year, month, cell.day);
          const isDragOver = dragOverKey === cell.key;
          const isPopoverOpen = popoverDay === cell.key;

          return (
            <div
              key={cell.key}
              onDragOver={(e) => {
                if (draggingId) {
                  e.preventDefault();
                  setDragOverKey(cell.key);
                }
              }}
              onDragLeave={() => setDragOverKey(null)}
              onDrop={() => handleDrop(cell.day!)}
              className={clsx(
                "relative min-h-[80px] border-b border-r border-brand-lea/5 p-1 transition sm:min-h-[110px]",
                isDragOver ? "bg-brand-gold/20 ring-2 ring-inset ring-brand-gold" : "hover:bg-brand-cloudDancer/20"
              )}
            >
              <button onClick={() => onDayClick?.(cellDate)} className="mb-1 flex w-full items-center px-1">
                <span
                  className={clsx(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition",
                    isToday ? "bg-brand-lea text-white" : "text-brand-lea hover:bg-brand-cloudDancer/50"
                  )}
                >
                  {cell.day}
                </span>
              </button>

              <div className="space-y-1">
                {dayInterviews.slice(0, 3).map((interview) => (
                  <div
                    key={interview.id}
                    draggable={interview.status !== "CANCELLED"}
                    onDragStart={() => setDraggingId(interview.id)}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDragOverKey(null);
                    }}
                    onClick={() => onInterviewClick?.(interview)}
                    className={clsx(
                      "block w-full cursor-pointer truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium shadow-sm transition",
                      chipClasses(interview),
                      draggingId === interview.id && "opacity-40"
                    )}
                    title={`${formatTime(interview.startDateTime)} - ${interview.candidate.displayName}${interview.job ? ` (${interview.job.title})` : ""}`}
                  >
                    {formatTime(interview.startDateTime)} {interview.candidate.displayName}
                  </div>
                ))}
                {dayInterviews.length > 3 && (
                  <button
                    onClick={() => setPopoverDay(isPopoverOpen ? null : cell.key)}
                    className="px-1 text-[10px] font-semibold text-brand-eden hover:underline"
                  >
                    +{dayInterviews.length - 3} more
                  </button>
                )}
              </div>

              {/* Day detail popover */}
              {isPopoverOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setPopoverDay(null)} />
                  <div className="absolute left-1 right-1 top-8 z-20 max-h-64 overflow-y-auto rounded-lg border border-brand-lea/20 bg-white p-2 shadow-xl">
                    <div className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.12em] text-brand-grey">
                      {MONTHS[month]} {cell.day} · {dayInterviews.length} interviews
                    </div>
                    <div className="space-y-1">
                      {dayInterviews.map((interview) => (
                        <button
                          key={interview.id}
                          onClick={() => {
                            setPopoverDay(null);
                            onInterviewClick?.(interview);
                          }}
                          className={clsx("block w-full truncate rounded px-2 py-1 text-left text-[11px] font-medium", chipClasses(interview))}
                        >
                          {formatTime(interview.startDateTime)} · {interview.candidate.displayName}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Stage legend + drag hint */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-brand-lea/10 px-4 py-3 text-xs text-brand-grey">
        <StageLegend />
        <span className="hidden italic text-brand-grey/70 sm:inline">Drag an interview to another day to reschedule</span>
      </div>
    </section>
  );
}
