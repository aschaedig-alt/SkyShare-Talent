"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  FileCheck2,
  Filter,
  Flag,
  GraduationCap,
  BookOpen,
  Users
} from "lucide-react";
import {
  buildOnboardingMonth,
  EVENT_LABEL,
  eventDateLabel,
  type CalendarSegment,
  type OnboardingCalendarData,
  type OnboardingEventKind
} from "@/lib/onboarding/calendar";
import { addDaysKey, windowStart } from "@/lib/travel/hub-calendar";
import { assignTravelerColors, FALLBACK_TRAVELER_COLOR } from "@/lib/travel/traveler-colors";
import { officeDayKey } from "@/lib/dates/display";

/**
 * Every actively onboarding hire's dates on a six-week month — the Travel
 * calendar's grid, header, colours and side list, with onboarding events in
 * place of trips. Feedback cmw0yn8lh / cmw0ytvlc (Nov 3). Lives on its own
 * Calendar tab on New hires, third after Checklist — chosen Nov 3 from previews
 * of a tab and a dashboard panel. Only hires still in onboarding are on it
 * (hiresInStage("ACTIVE")): marking someone onboarded takes them off.
 *
 * Travel stays on the Travel calendar ("only show travel on the travel tab");
 * the two share their month window, colours and controls, not their contents.
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const KIND_ICON: Record<OnboardingEventKind, typeof Flag> = {
  start: Flag,
  orientation: Users,
  indoc: BookOpen,
  training: GraduationCap,
  i9: FileCheck2
};

const KINDS: OnboardingEventKind[] = ["start", "orientation", "indoc", "training", "i9"];

const DATE_ROW_HEIGHT = 26;
const LANE_HEIGHT = 22;
const weekRowHeight = (lanes: number) => Math.max(84, DATE_ROW_HEIGHT + lanes * LANE_HEIGHT + 6);

/** "Cameron Morgan" -> "Cameron M." — enough to tell two hires apart in a 100px day. */
function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : name;
}

function shortDay(key: string | undefined): string {
  if (!key) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${key}T00:00:00Z`)
  );
}

export function OnboardingCalendar({ data, title = "Onboarding calendar" }: { data: OnboardingCalendarData; title?: string }) {
  const { hires, undated } = data;
  const colors = useMemo(() => assignTravelerColors(hires.map((h) => h.id)), [hires]);
  const byId = useMemo(() => new Map(hires.map((h) => [h.id, h])), [hires]);

  const today = useMemo(() => officeDayKey(new Date()), []);
  const thisMonth = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 };
  const [cursor, setCursor] = useState(thisMonth);
  const [focused, setFocused] = useState<string | null>(null);

  const shown = useMemo(() => (focused ? hires.filter((h) => h.id === focused) : hires), [hires, focused]);
  const weeks = useMemo(() => buildOnboardingMonth(shown, cursor.year, cursor.month, today), [shown, cursor, today]);

  const shift = (delta: number) => {
    const next = new Date(Date.UTC(cursor.year, cursor.month + delta, 1));
    setCursor({ year: next.getUTCFullYear(), month: next.getUTCMonth() });
  };
  const onThisMonth = cursor.year === thisMonth.year && cursor.month === thisMonth.month;

  const monthName = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(cursor.year, cursor.month, 1))
  );
  const from = windowStart(cursor.year, cursor.month);
  const to = addDaysKey(from, 41);

  const inWindow = useMemo(
    () =>
      hires
        .map((h) => ({ hire: h, events: h.events.filter((e) => e.endDay >= from && e.startDay <= to) }))
        .filter((x) => x.events.length > 0),
    [hires, from, to]
  );

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-brand-gold" />
            <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">{title}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-brand-grey dark:text-slate-400">
            {KINDS.map((k) => {
              const Icon = KIND_ICON[k];
              return (
                <span key={k} className="inline-flex items-center gap-1">
                  <Icon className="h-3 w-3" /> {EVENT_LABEL[k]}
                </span>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCursor(thisMonth)}
            aria-pressed={onThisMonth}
            title="Show this month"
            className="mr-1 rounded border border-brand-lea/15 px-2.5 py-1 text-xs font-semibold text-brand-lea transition hover:bg-brand-gold/10 hover:shadow-glow dark:border-white/10 dark:text-slate-200"
          >
            Today
          </button>
          <button
            onClick={() => shift(-1)}
            aria-label="Previous month"
            className="rounded border border-brand-lea/15 p-1 text-brand-lea transition hover:bg-brand-gold/10 dark:border-white/10 dark:text-slate-200"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[180px] text-center text-sm font-semibold text-brand-lea dark:text-slate-100">
            {monthName}
            <span className="ml-1.5 text-[11px] font-medium text-brand-grey dark:text-slate-400">
              {shortDay(from)} – {shortDay(to)}
            </span>
          </span>
          <button
            onClick={() => shift(1)}
            aria-label="Next month"
            className="rounded border border-brand-lea/15 p-1 text-brand-lea transition hover:bg-brand-gold/10 dark:border-white/10 dark:text-slate-200"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        {/* ---------------- the grid (the Travel calendar's, day for day) ---------------- */}
        <div className="min-w-0 overflow-x-auto overflow-y-hidden">
          <div className="min-w-[700px]">
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-t border border-b-0 border-brand-lea/10 bg-brand-lea/10 dark:border-white/10 dark:bg-white/10">
              {WEEKDAYS.map((w) => (
                <div
                  key={w}
                  className="bg-brand-cloudDancer/70 py-1.5 text-center text-[10px] font-bold uppercase tracking-[0.09em] text-brand-grey dark:bg-white/5 dark:text-slate-400"
                >
                  {w}
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-px overflow-hidden rounded-b border border-t-0 border-brand-lea/10 bg-brand-lea/10 dark:border-white/10 dark:bg-white/10">
              {weeks.map((week) => (
                <div key={week.days[0].key} className="relative grid grid-cols-7 gap-px">
                  {week.days.map((day) => (
                    <div
                      key={day.key}
                      style={{ minHeight: weekRowHeight(week.lanes.length) }}
                      className={clsx(
                        "px-1.5 py-1",
                        day.inMonth ? "bg-white dark:bg-brand-panel" : "bg-[#e7eef7] dark:bg-[#0b1c2b]",
                        day.isToday && "ring-2 ring-inset ring-brand-gold"
                      )}
                    >
                      <span
                        className={clsx(
                          "flex items-baseline gap-1.5 text-[11px] font-semibold tabular-nums",
                          day.inMonth ? "text-brand-grey dark:text-slate-400" : "text-brand-grey/70 dark:text-slate-500"
                        )}
                      >
                        {day.dayNum}
                        {day.monthTag ? (
                          <span className="text-[9.5px] font-extrabold uppercase tracking-[0.07em] text-brand-gold">{day.monthTag}</span>
                        ) : null}
                      </span>
                    </div>
                  ))}

                  {/* Events float over the day cells so indoc can span several days. */}
                  <div className="absolute inset-x-0 top-[26px] flex flex-col">
                    {week.lanes.map((lane, li) => (
                      <div key={li} className="mb-1 grid grid-cols-7 gap-px">
                        {lane.map((seg) => (
                          <EventChip
                            key={`${seg.hireId}-${seg.kind}-${seg.startCol}`}
                            seg={seg}
                            name={byId.get(seg.hireId)?.name ?? ""}
                            href={byId.get(seg.hireId)?.href ?? "#"}
                            chipClass={(colors.get(seg.hireId) ?? FALLBACK_TRAVELER_COLOR).chip}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ---------------- the rail ---------------- */}
        <div className="min-w-0">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.09em] text-brand-grey dark:text-slate-400">
            {inWindow.length === 0 ? "Nobody in view" : `${inWindow.length} new hire${inWindow.length === 1 ? "" : "s"} in view`}
          </p>
          {inWindow.length === 0 ? (
            <p className="text-[12.5px] text-brand-grey dark:text-slate-400">
              Nothing in this six-week window. Use the arrows, or Today, to find the month you want.
            </p>
          ) : null}

          {inWindow.map(({ hire, events }) => {
            const c = colors.get(hire.id) ?? FALLBACK_TRAVELER_COLOR;
            const dim = focused !== null && focused !== hire.id;
            return (
              <div
                key={hire.id}
                className={clsx("mb-2.5 overflow-hidden rounded border border-brand-lea/12 transition dark:border-white/10", dim && "opacity-45")}
              >
                <div className={clsx("flex items-center gap-1 px-3 py-1.5", c.band)}>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold">{hire.name}</span>
                  <button
                    onClick={() => setFocused(focused === hire.id ? null : hire.id)}
                    title={focused === hire.id ? "Show everyone again" : `Show only ${hire.name} on the grid`}
                    aria-pressed={focused === hire.id}
                    className={clsx("shrink-0 rounded p-1 transition hover:brightness-110", focused === hire.id ? "bg-black/15" : "opacity-70 hover:opacity-100")}
                  >
                    <Filter className="h-3.5 w-3.5" />
                  </button>
                  {/* Straight to their checklist (his ask, Nov 3) — a real link, so it
                      ctrl-clicks into a new tab. */}
                  <Link
                    href={`${hire.href}?tab=checklist#sections`}
                    title={`Open ${hire.name}'s checklist`}
                    aria-label={`Open ${hire.name}'s checklist`}
                    className="shrink-0 rounded p-1 opacity-70 transition hover:opacity-100 hover:brightness-110"
                  >
                    <ClipboardList className="h-3.5 w-3.5" />
                  </Link>
                  <Link
                    href={hire.href}
                    title={`Open ${hire.name}'s onboarding record`}
                    aria-label={`Open ${hire.name}'s onboarding record`}
                    className="shrink-0 rounded p-1 opacity-70 transition hover:opacity-100 hover:brightness-110"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <ul className="bg-white px-3 py-1.5 dark:bg-brand-panel">
                  {hire.position ? (
                    <li className="pb-1 text-[12px] text-brand-grey dark:text-slate-400">{hire.position}</li>
                  ) : null}
                  {events.map((e) => {
                    const Icon = KIND_ICON[e.kind];
                    return (
                      <li
                        key={`${e.kind}-${e.startDay}`}
                        className="flex items-baseline gap-2 border-t border-brand-lea/8 py-1 text-[12.5px] dark:border-white/8"
                      >
                        <Icon className="h-3 w-3 shrink-0 translate-y-0.5 text-brand-grey/70 dark:text-slate-500" />
                        <span className="shrink-0 font-bold text-brand-lea dark:text-slate-100">{EVENT_LABEL[e.kind]}</span>
                        {e.detail && e.kind !== "start" ? (
                          <span className="min-w-0 truncate text-brand-grey dark:text-slate-400" title={e.detail}>
                            {e.detail}
                          </span>
                        ) : null}
                        <span className="ml-auto shrink-0 tabular-nums text-brand-grey/80 dark:text-slate-500">{eventDateLabel(e)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}

          {focused ? (
            <button
              onClick={() => setFocused(null)}
              className="rounded border border-brand-lea/15 px-2 py-1 text-[11.5px] font-semibold text-brand-grey transition hover:text-brand-lea dark:border-white/10 dark:text-slate-400"
            >
              Show everyone
            </button>
          ) : null}

          {/* Anyone who cannot be drawn is NAMED, never silently left off. */}
          {undated.length > 0 ? (
            <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200">
              Not on the calendar — no dates yet:{" "}
              {undated.map((u, i) => (
                <span key={u.href}>
                  {i > 0 ? ", " : ""}
                  <Link href={u.href} className="font-semibold underline-offset-2 hover:underline">
                    {u.name}
                  </Link>
                </span>
              ))}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** One event in one week. Squared off where it carries on into the next week. */
function EventChip({ seg, name, href, chipClass }: { seg: CalendarSegment; name: string; href: string; chipClass: string }) {
  const Icon = KIND_ICON[seg.kind];
  return (
    <Link
      href={href}
      title={`${name} — ${EVENT_LABEL[seg.kind]}`}
      style={{ gridColumn: `${seg.startCol} / span ${seg.span}` }}
      className={clsx(
        "mx-0.5 flex h-[18px] min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap rounded px-1.5 text-[10.5px] font-semibold transition hover:brightness-95",
        chipClass,
        // Dashed = worked out by the app (the I-9 deadline), not a date somebody set.
        seg.kind === "i9" && "border border-dashed border-brand-lea/35 dark:border-white/30",
        seg.continuesLeft && "rounded-l-none",
        seg.continuesRight && "rounded-r-none"
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{shortName(name)}</span>
    </Link>
  );
}
