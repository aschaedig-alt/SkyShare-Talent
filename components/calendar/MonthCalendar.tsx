"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { clsx } from "clsx";
import type { CalendarData } from "@/lib/data/calendar";

type Interview = CalendarData["interviews"][number];

interface MonthCalendarProps {
  interviews: Interview[];
  onDayClick?: (date: Date) => void;
  onInterviewClick?: (interview: Interview) => void;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function statusColor(status: string) {
  switch (status) {
    case "SCHEDULED":
      return "bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-300";
    case "COMPLETED":
      return "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border-emerald-300";
    case "CANCELLED":
      return "bg-slate-100 text-slate-500 hover:bg-slate-200 border-slate-300 line-through";
    default:
      return "bg-brand-gold/20 text-brand-lea hover:bg-brand-gold/30 border-brand-gold/40";
  }
}

export function MonthCalendar({ interviews, onDayClick, onInterviewClick }: MonthCalendarProps) {
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // Build calendar grid
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

  // Build cells (leading blanks + days)
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

  function formatTime(iso: string) {
    return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  }

  return (
    <section className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-brand-lea/10 px-4 py-3">
        <h2 className="text-lg font-semibold text-brand-lea">
          {MONTHS[month]} {year}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={goToToday}
            className="rounded border border-brand-lea/20 px-3 py-1 text-xs font-semibold text-brand-lea hover:bg-brand-cloudDancer/30"
          >
            Today
          </button>
          <button
            onClick={goToPrevMonth}
            className="rounded border border-brand-lea/20 p-1 text-brand-lea hover:bg-brand-cloudDancer/30"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={goToNextMonth}
            className="rounded border border-brand-lea/20 p-1 text-brand-lea hover:bg-brand-cloudDancer/30"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-brand-lea/10">
        {WEEKDAYS.map((day) => (
          <div key={day} className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey">
            {day}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {cells.map((cell) => {
          if (cell.day === null) {
            return <div key={cell.key} className="min-h-[100px] border-b border-r border-brand-lea/5 bg-brand-cloudDancer/10" />;
          }

          const dayInterviews = interviewsByDay.get(cell.key) ?? [];
          const isToday = cell.key === todayKey;
          const cellDate = new Date(year, month, cell.day);

          return (
            <div
              key={cell.key}
              className="min-h-[100px] border-b border-r border-brand-lea/5 p-1 transition hover:bg-brand-cloudDancer/20"
            >
              <button
                onClick={() => onDayClick?.(cellDate)}
                className="mb-1 flex w-full items-center justify-between px-1"
              >
                <span
                  className={clsx(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                    isToday ? "bg-brand-lea text-white" : "text-brand-lea"
                  )}
                >
                  {cell.day}
                </span>
              </button>

              <div className="space-y-1">
                {dayInterviews.slice(0, 3).map((interview) => (
                  <button
                    key={interview.id}
                    onClick={() => onInterviewClick?.(interview)}
                    className={clsx(
                      "block w-full truncate rounded border px-1.5 py-0.5 text-left text-[10px] font-medium transition",
                      statusColor(interview.status)
                    )}
                    title={`${formatTime(interview.startDateTime)} - ${interview.candidate.displayName}`}
                  >
                    {formatTime(interview.startDateTime)} {interview.candidate.displayName}
                  </button>
                ))}
                {dayInterviews.length > 3 && (
                  <div className="px-1 text-[10px] font-medium text-brand-grey">
                    +{dayInterviews.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 border-t border-brand-lea/10 px-4 py-3 text-xs text-brand-grey">
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded border border-blue-300 bg-blue-100" /> Scheduled
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded border border-emerald-300 bg-emerald-100" /> Completed
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded border border-slate-300 bg-slate-100" /> Cancelled
        </span>
      </div>
    </section>
  );
}
