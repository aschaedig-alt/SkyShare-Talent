"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { clsx } from "clsx";
import type { CalendarData } from "@/lib/data/calendar";
import { formatTime } from "@/lib/calendar/format";
import { interviewTypeMeta } from "@/lib/calendar/interview-types";
import { StageLegend } from "@/components/calendar/StageLegend";

type Interview = CalendarData["interviews"][number];

interface TimeGridCalendarProps {
  interviews: Interview[];
  mode: "week" | "day";
  onSlotClick?: (date: Date) => void;
  onInterviewClick?: (interview: Interview) => void;
  onReschedule?: (interviewId: string, newDate: Date, options?: { keepOriginalTime?: boolean }) => void;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// Show 7am to 8pm by default
const START_HOUR = 7;
const END_HOUR = 20;
const HOUR_HEIGHT = 56; // px per hour

function blockClasses(interview: Interview) {
  const meta = interviewTypeMeta(interview.interviewType);
  if (interview.status === "CANCELLED") {
    return "bg-slate-300 text-slate-600 hover:bg-slate-400 border-slate-400 line-through";
  }
  const completed = interview.status === "COMPLETED" ? "opacity-60" : "";
  return `${meta.chip} border-black/10 ${completed}`;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

export function TimeGridCalendar({ interviews, mode, onSlotClick, onInterviewClick, onReschedule }: TimeGridCalendarProps) {
  const [anchorDate, setAnchorDate] = useState(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);

  function slotKey(day: Date, hour: number) {
    return `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}-${hour}`;
  }

  function handleSlotDrop(day: Date, hour: number) {
    if (draggingId && onReschedule) {
      const target = new Date(day);
      target.setHours(hour, 0, 0, 0);
      onReschedule(draggingId, target);
    }
    setDraggingId(null);
    setDragOverSlot(null);
  }

  // Days to render
  const days: Date[] = [];
  if (mode === "week") {
    const weekStart = startOfWeek(anchorDate);
    for (let i = 0; i < 7; i += 1) {
      days.push(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i));
    }
  } else {
    days.push(new Date(anchorDate));
  }

  const hours: number[] = [];
  for (let h = START_HOUR; h <= END_HOUR; h += 1) {
    hours.push(h);
  }

  const today = new Date();
  const isToday = (d: Date) =>
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();

  function navigate(direction: number) {
    const step = mode === "week" ? 7 : 1;
    setAnchorDate(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate() + direction * step));
  }

  function goToToday() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    setAnchorDate(now);
  }

  // Get interviews for a specific day
  function interviewsForDay(day: Date): Interview[] {
    return interviews.filter((interview) => {
      const d = new Date(interview.startDateTime);
      return (
        d.getFullYear() === day.getFullYear() &&
        d.getMonth() === day.getMonth() &&
        d.getDate() === day.getDate()
      );
    });
  }

  // Position an interview block within the grid
  function blockStyle(interview: Interview) {
    const start = new Date(interview.startDateTime);
    const end = interview.endDateTime ? new Date(interview.endDateTime) : new Date(start.getTime() + 60 * 60 * 1000);
    const startMinutes = (start.getHours() - START_HOUR) * 60 + start.getMinutes();
    const durationMinutes = Math.max(30, (end.getTime() - start.getTime()) / (1000 * 60));
    return {
      top: `${(startMinutes / 60) * HOUR_HEIGHT}px`,
      height: `${(durationMinutes / 60) * HOUR_HEIGHT}px`
    };
  }

  // Header label
  const headerLabel =
    mode === "week"
      ? `${MONTHS[days[0].getMonth()]} ${days[0].getDate()} – ${days[6].getDate()}, ${days[6].getFullYear()}`
      : `${WEEKDAYS[days[0].getDay()]}, ${MONTHS[days[0].getMonth()]} ${days[0].getDate()}, ${days[0].getFullYear()}`;

  return (
    <section className="rounded-xl bg-white shadow-panel ring-1 ring-brand-lea/10">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-brand-lea/10 px-4 py-3">
        <h2 className="text-lg font-semibold text-brand-lea">{headerLabel}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={goToToday}
            className="rounded-lg border border-brand-lea/20 px-3 py-1 text-xs font-semibold text-brand-lea hover:bg-brand-cloudDancer/30"
          >
            Today
          </button>
          <button
            onClick={() => navigate(-1)}
            className="rounded-lg border border-brand-lea/20 p-1 text-brand-lea hover:bg-brand-cloudDancer/30"
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => navigate(1)}
            className="rounded-lg border border-brand-lea/20 p-1 text-brand-lea hover:bg-brand-cloudDancer/30"
            aria-label="Next"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div className="flex border-b border-brand-lea/10">
        <div className="w-14 shrink-0" />
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className={clsx(
              "flex-1 px-2 py-2 text-center",
              isToday(day) && "bg-brand-sweet/10"
            )}
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-grey">
              {WEEKDAYS[day.getDay()]}
            </div>
            <div
              className={clsx(
                "mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
                isToday(day) ? "bg-brand-lea text-white" : "text-brand-lea"
              )}
            >
              {day.getDate()}
            </div>
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div className="max-h-[600px] overflow-y-auto">
        <div className="flex">
          {/* Hour labels */}
          <div className="w-14 shrink-0">
            {hours.map((hour) => (
              <div key={hour} className="relative" style={{ height: `${HOUR_HEIGHT}px` }}>
                <span className="absolute -top-2 right-2 text-[10px] font-medium text-brand-grey">
                  {hour === 12 ? "12 PM" : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day) => {
            const dayInterviews = interviewsForDay(day);
            return (
              <div
                key={day.toISOString()}
                className={clsx("relative flex-1 border-l border-brand-lea/10", isToday(day) && "bg-brand-sweet/5")}
              >
                {/* Hour cells (clickable + drop targets) */}
                {hours.map((hour) => {
                  const key = slotKey(day, hour);
                  const isDragOver = dragOverSlot === key;
                  return (
                    <button
                      key={hour}
                      onClick={() => {
                        const slot = new Date(day);
                        slot.setHours(hour, 0, 0, 0);
                        onSlotClick?.(slot);
                      }}
                      onDragOver={(e) => {
                        if (draggingId) {
                          e.preventDefault();
                          setDragOverSlot(key);
                        }
                      }}
                      onDragLeave={() => setDragOverSlot((cur) => (cur === key ? null : cur))}
                      onDrop={() => handleSlotDrop(day, hour)}
                      className={clsx(
                        "block w-full border-b border-brand-lea/5 transition",
                        isDragOver ? "bg-brand-gold/25 ring-1 ring-inset ring-brand-gold" : "hover:bg-brand-gold/5"
                      )}
                      style={{ height: `${HOUR_HEIGHT}px` }}
                      aria-label={`Schedule at ${hour}:00`}
                    />
                  );
                })}

                {/* Interview blocks */}
                {dayInterviews.map((interview) => (
                  <div
                    key={interview.id}
                    draggable={interview.status !== "CANCELLED"}
                    onDragStart={() => setDraggingId(interview.id)}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDragOverSlot(null);
                    }}
                    onClick={() => onInterviewClick?.(interview)}
                    style={blockStyle(interview)}
                    className={clsx(
                      "absolute left-0.5 right-0.5 cursor-pointer overflow-hidden rounded-md border px-1.5 py-1 text-left text-[10px] shadow-sm transition",
                      blockClasses(interview),
                      draggingId === interview.id && "opacity-40"
                    )}
                  >
                    <div className="font-semibold leading-tight">{formatTime(interview.startDateTime)}</div>
                    <div className="truncate font-medium leading-tight">{interview.candidate.displayName}</div>
                    {interview.job && <div className="truncate opacity-90 leading-tight">{interview.job.title}</div>}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Stage legend + drag hint */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-brand-lea/10 px-4 py-3 text-xs text-brand-grey">
        <StageLegend />
        <span className="hidden italic text-brand-grey/70 sm:inline">Drag an interview to another time slot to reschedule</span>
      </div>
    </section>
  );
}
