/**
 * The onboarding calendar's events and month layout — pure, no Prisma, so the
 * page (a client component) can import it. The query lives in
 * lib/data/onboarding-calendar.ts.
 *
 * Asked for in feedback cmw0yn8lh and cmw0ytvlc (Nov 3): a month view of every
 * actively onboarding hire's start date, orientation, indoc and training, with
 * "complete I-9 by", built on the same calendar as Travel. Shown on its own
 * Calendar tab on New hires (chosen Nov 3, after previewing a tab and a
 * dashboard panel).
 *
 * Shares the Travel calendar's six-week window (windowStart / addDaysKey) so
 * both calendars draw the same weeks for the same month.
 */
import { addDaysKey, windowStart } from "@/lib/travel/hub-calendar";

export type OnboardingEventKind = "start" | "orientation" | "indoc" | "training" | "i9";

export const EVENT_LABEL: Record<OnboardingEventKind, string> = {
  start: "Starts",
  orientation: "Orientation",
  indoc: "Indoc",
  training: "Training",
  i9: "I-9 due"
};

export type OnboardingEvent = {
  kind: OnboardingEventKind;
  /** yyyy-mm-dd; endDay equals startDay for a one-day event. */
  startDay: string;
  endDay: string;
  /** Extra words for the rail, e.g. the training location. */
  detail: string | null;
  /** Worked out by the app rather than entered by a person (the I-9 deadline). */
  computed: boolean;
};

export type OnboardingCalendarHire = {
  id: string;
  name: string;
  position: string | null;
  href: string;
  events: OnboardingEvent[];
};

export type OnboardingCalendarData = {
  hires: OnboardingCalendarHire[];
  /** Actively onboarding with no date at all yet — named, never silently omitted. */
  undated: { name: string; href: string }[];
};

/**
 * Form I-9 Section 2 is due by the end of the employee's THIRD business day of
 * employment, counting from the first day of work. Weekends are skipped;
 * federal holidays are NOT (the app holds no holiday calendar), which is why
 * the event is marked computed and the rail says so.
 */
export function i9DueDay(startDay: string): string {
  let day = startDay;
  let counted = 0;
  while (counted < 3) {
    day = addDaysKey(day, 1);
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) counted += 1;
  }
  return day;
}

export type CalendarSegment = {
  hireId: string;
  kind: OnboardingEventKind;
  startCol: number; // 1..7
  span: number;
  /** The event carries on into the week before / after. */
  continuesLeft: boolean;
  continuesRight: boolean;
};

export type CalendarDay = { key: string; dayNum: number; inMonth: boolean; monthTag: string | null; isToday: boolean };
export type CalendarWeek = { days: CalendarDay[]; lanes: CalendarSegment[][] };

const DAY_MS = 86_400_000;
const diffDays = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

/** Order events take a lane in, so a week reads start → orientation → indoc → training → I-9. */
const KIND_ORDER: Record<OnboardingEventKind, number> = { start: 0, orientation: 1, indoc: 2, training: 3, i9: 4 };

/** Six weeks of days with every event cut into week rows and packed into lanes. */
export function buildOnboardingMonth(
  hires: OnboardingCalendarHire[],
  year: number,
  month: number,
  todayKey: string
): CalendarWeek[] {
  const start = windowStart(year, month);
  const weeks: CalendarWeek[] = [];
  for (let w = 0; w < 6; w += 1) {
    const days: CalendarDay[] = [];
    for (let d = 0; d < 7; d += 1) {
      const key = addDaysKey(start, w * 7 + d);
      const dayNum = Number(key.slice(8, 10));
      days.push({
        key,
        dayNum,
        inMonth: Number(key.slice(5, 7)) - 1 === month,
        monthTag:
          dayNum === 1
            ? new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(`${key}T00:00:00Z`))
            : null,
        isToday: key === todayKey
      });
    }
    const weekStart = days[0].key;
    const weekEnd = days[6].key;

    const segments: CalendarSegment[] = [];
    for (const h of hires) {
      for (const e of h.events) {
        if (e.endDay < weekStart || e.startDay > weekEnd) continue;
        const segStart = e.startDay > weekStart ? e.startDay : weekStart;
        const segEnd = e.endDay < weekEnd ? e.endDay : weekEnd;
        segments.push({
          hireId: h.id,
          kind: e.kind,
          startCol: diffDays(weekStart, segStart) + 1,
          span: diffDays(segStart, segEnd) + 1,
          continuesLeft: e.startDay < weekStart,
          continuesRight: e.endDay > weekEnd
        });
      }
    }
    segments.sort((a, b) => a.startCol - b.startCol || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.span - a.span);

    // Greedy lanes: each segment takes the first lane it does not overlap.
    const lanes: CalendarSegment[][] = [];
    for (const seg of segments) {
      const lane = lanes.find((l) => l.every((o) => seg.startCol > o.startCol + o.span - 1 || seg.startCol + seg.span - 1 < o.startCol));
      if (lane) lane.push(seg);
      else lanes.push([seg]);
    }
    weeks.push({ days, lanes });
  }
  return weeks;
}

/** "Nov 17" or "Nov 17 – 21". */
export function eventDateLabel(e: OnboardingEvent): string {
  const fmt = (k: string) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${k}T00:00:00Z`));
  return e.startDay === e.endDay ? fmt(e.startDay) : `${fmt(e.startDay)} – ${fmt(e.endDay)}`;
}
