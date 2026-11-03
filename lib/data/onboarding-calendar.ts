import { prisma } from "@/lib/prisma";
import { hiresInStage } from "@/lib/data/onboarding";
import { officeDayKey } from "@/lib/dates/display";
import { i9DueDay, type OnboardingCalendarData, type OnboardingEvent } from "@/lib/onboarding/calendar";

/**
 * Every actively onboarding hire's dates, for the onboarding calendar
 * (feedback cmw0yn8lh / cmw0ytvlc — see lib/onboarding/calendar.ts).
 *
 * Marking a hire onboarded moves them to stage POST_ONBOARD
 * (app/api/new-hires/[id]/route.ts), which takes them off this calendar.
 *
 * "Actively onboarding" is hiresInStage("ACTIVE") — the dashboard's own rule —
 * so the calendar and the dashboard can never disagree about who is on it.
 *
 * Calendar days (start, indoc, training, orientationDate) are stored as UTC
 * midnight, so their key is the UTC date. A session is a real moment, so its
 * day is taken in the office timezone (lib/dates/display.ts explains why).
 */
const dayOf = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export async function getOnboardingCalendarData(): Promise<OnboardingCalendarData> {
  const hires = await prisma.newHire.findMany({
    where: hiresInStage("ACTIVE"),
    select: {
      id: true,
      name: true,
      position: true,
      startDate: true,
      orientationDate: true,
      indocStartDate: true,
      indocEndDate: true,
      trainingDate: true,
      trainingLocation: true,
      orientationAttendances: { select: { session: { select: { date: true, status: true } } } }
    },
    orderBy: { name: "asc" }
  });

  const out: OnboardingCalendarData = { hires: [], undated: [] };
  for (const h of hires) {
    const events: OnboardingEvent[] = [];
    const one = (kind: OnboardingEvent["kind"], day: string | null, detail: string | null = null, computed = false) => {
      if (day) events.push({ kind, startDay: day, endDay: day, detail, computed });
    };

    const start = dayOf(h.startDate);
    one("start", start, h.position);

    // The session they are booked on wins; the date on their record is the fallback.
    const session = h.orientationAttendances
      .map((a) => a.session)
      .sort((a, b) => b.date.getTime() - a.date.getTime())[0];
    one("orientation", session ? officeDayKey(session.date) : dayOf(h.orientationDate), session ? null : "date on their record — not booked on a session");

    const indocFrom = dayOf(h.indocStartDate);
    const indocTo = dayOf(h.indocEndDate) ?? indocFrom;
    if (indocFrom && indocTo) {
      events.push({ kind: "indoc", startDay: indocFrom, endDay: indocTo < indocFrom ? indocFrom : indocTo, detail: null, computed: false });
    }

    one("training", dayOf(h.trainingDate), h.trainingLocation);
    if (start) one("i9", i9DueDay(start), "3 business days after start — holidays not counted", true);

    if (events.length) out.hires.push({ id: h.id, name: h.name, position: h.position, href: `/people/${h.id}`, events });
    else out.undated.push({ name: h.name, href: `/people/${h.id}` });
  }
  return out;
}
