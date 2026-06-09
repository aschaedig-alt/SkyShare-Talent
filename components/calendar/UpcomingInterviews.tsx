"use client";

import Link from "next/link";
import { clsx } from "clsx";
import { CalendarClock, Mail, Phone, Video, MapPin, Briefcase } from "lucide-react";
import type { CalendarData } from "@/lib/data/calendar";
import { formatRelativeDay, formatTime } from "@/lib/calendar/format";
import { timezoneAbbr } from "@/lib/calendar/timezones";

type Interview = CalendarData["interviews"][number];

interface UpcomingInterviewsProps {
  interviews: Interview[];
  onInterviewClick?: (interview: Interview) => void;
}

function accentColor(status: string) {
  switch (status) {
    case "SCHEDULED":
      return "border-l-blue-500";
    case "COMPLETED":
      return "border-l-emerald-500";
    case "CANCELLED":
      return "border-l-slate-400";
    default:
      return "border-l-brand-gold";
  }
}

export function UpcomingInterviews({ interviews, onInterviewClick }: UpcomingInterviewsProps) {
  const now = new Date();
  const upcoming = interviews
    .filter((i) => i.status === "SCHEDULED" && new Date(i.startDateTime) >= now)
    .sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime())
    .slice(0, 5);

  if (upcoming.length === 0) {
    return null;
  }

  return (
    <section className="rounded-xl bg-gradient-to-br from-brand-lea to-brand-eden p-5 shadow-panel">
      <div className="flex items-center gap-2 text-white">
        <CalendarClock className="h-5 w-5 text-brand-gold" />
        <h2 className="text-base font-semibold">Upcoming Interviews</h2>
        <span className="ml-auto rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold text-white">
          {upcoming.length}
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {upcoming.map((interview) => (
          <button
            key={interview.id}
            onClick={() => onInterviewClick?.(interview)}
            className={clsx(
              "block w-full rounded-lg border-l-4 bg-white p-3 text-left shadow-sm transition hover:shadow-md",
              accentColor(interview.status)
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-brand-gold/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-lea">
                    {formatRelativeDay(interview.startDateTime)}
                  </span>
                  <span className="text-sm font-bold text-brand-lea">
                    {formatTime(interview.startDateTime)} {timezoneAbbr(interview.timezone)}
                  </span>
                </div>
                <div className="mt-1.5 truncate text-base font-semibold text-brand-lea">
                  {interview.candidate.displayName}
                </div>
                {interview.candidate.currentTitle && (
                  <div className="truncate text-xs text-brand-grey">{interview.candidate.currentTitle}</div>
                )}

                {/* Quick contact + job chips */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {interview.job && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-cloudDancer/60 px-2 py-0.5 text-[10px] font-medium text-brand-lea">
                      <Briefcase className="h-3 w-3" /> {interview.job.title}
                    </span>
                  )}
                  {interview.candidate.email && (
                    <a
                      href={`mailto:${interview.candidate.email}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 rounded-full bg-brand-cloudDancer/60 px-2 py-0.5 text-[10px] font-medium text-brand-lea hover:bg-brand-sweet/30"
                    >
                      <Mail className="h-3 w-3" /> Email
                    </a>
                  )}
                  {interview.candidate.phone && (
                    <a
                      href={`tel:${interview.candidate.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 rounded-full bg-brand-cloudDancer/60 px-2 py-0.5 text-[10px] font-medium text-brand-lea hover:bg-brand-sweet/30"
                    >
                      <Phone className="h-3 w-3" /> Call
                    </a>
                  )}
                  {interview.meetingUrl && (
                    <a
                      href={interview.meetingUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-200"
                    >
                      <Video className="h-3 w-3" /> Join
                    </a>
                  )}
                  {interview.location && !interview.meetingUrl && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-cloudDancer/60 px-2 py-0.5 text-[10px] font-medium text-brand-lea">
                      <MapPin className="h-3 w-3" /> {interview.location}
                    </span>
                  )}
                </div>
              </div>

              <Link
                href={`/candidates/${interview.candidate.id}`}
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 rounded-lg border border-brand-lea/20 px-2 py-1 text-[10px] font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/30"
              >
                Profile
              </Link>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
