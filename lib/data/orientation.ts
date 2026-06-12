import { prisma } from "@/lib/prisma";
import { DEFAULT_PREP_TASKS, isPilotPosition } from "@/lib/orientation/defaults";
import { getEmailTemplates } from "@/lib/data/orientation-templates";
import type { EmailTemplateDef } from "@/lib/orientation/defaults";

export type SessionStatus = "UPCOMING" | "COMPLETE" | "CANCELED";
export type ConfirmStatus = "PENDING" | "CONFIRMED" | "DECLINED";
export type TravelStatus = "NA" | "NEEDED" | "ARRANGED";

function iso(d: Date | null) {
  return d ? d.toISOString() : null;
}

export type SessionListItem = {
  id: string;
  date: string;
  location: string | null;
  status: SessionStatus;
  attendeeCount: number;
  prepDone: number;
  prepTotal: number;
  notConfirmed: number;
  travelPending: number;
};

export async function getOrientationSessions(): Promise<{ upcoming: SessionListItem[]; past: SessionListItem[] }> {
  const sessions = await prisma.orientationSession.findMany({
    include: {
      attendees: { select: { confirmed: true, travelStatus: true } },
      prepTasks: { select: { done: true } }
    },
    orderBy: { date: "asc" }
  });

  const items: SessionListItem[] = sessions.map((s) => ({
    id: s.id,
    date: s.date.toISOString(),
    location: s.location,
    status: s.status as SessionStatus,
    attendeeCount: s.attendees.length,
    prepDone: s.prepTasks.filter((t) => t.done).length,
    prepTotal: s.prepTasks.length,
    notConfirmed: s.attendees.filter((a) => a.confirmed !== "CONFIRMED").length,
    travelPending: s.attendees.filter((a) => a.travelStatus === "NEEDED").length
  }));

  const now = Date.now();
  const upcoming = items.filter((s) => s.status !== "COMPLETE" && new Date(s.date).getTime() >= now - 86_400_000);
  const past = items.filter((s) => !upcoming.includes(s)).reverse();
  return { upcoming, past };
}

export type AttendeeView = {
  id: string;
  newHireId: string;
  name: string;
  position: string | null;
  department: string | null;
  isPilot: boolean;
  confirmed: ConfirmStatus;
  travelStatus: TravelStatus;
  ipadReady: boolean;
  cardReady: boolean;
  swagReady: boolean;
  sentTemplateKeys: string[];
};

export type PrepTaskView = {
  id: string;
  label: string;
  owner: string | null;
  dueDaysBefore: number | null;
  done: boolean;
};

export type SessionCandidate = { id: string; name: string; position: string | null; suggested: boolean };

export type SessionDetail = {
  id: string;
  date: string;
  location: string | null;
  address: string | null;
  meetLink: string | null;
  notes: string | null;
  status: SessionStatus;
  attendees: AttendeeView[];
  prepTasks: PrepTaskView[];
  headcount: { total: number; outOfTown: number; pilots: number; confirmed: number };
  candidates: SessionCandidate[];
  templates: EmailTemplateDef[];
};

function parseKeys(json: string): string[] {
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function getSessionDetail(id: string): Promise<SessionDetail | null> {
  const s = await prisma.orientationSession.findUnique({
    where: { id },
    include: {
      attendees: {
        include: { newHire: { select: { id: true, name: true, position: true, department: true } } },
        orderBy: { newHire: { name: "asc" } }
      },
      prepTasks: { orderBy: { order: "asc" } }
    }
  });
  if (!s) return null;

  const attendees: AttendeeView[] = s.attendees.map((a) => ({
    id: a.id,
    newHireId: a.newHireId,
    name: a.newHire.name,
    position: a.newHire.position,
    department: a.newHire.department,
    isPilot: isPilotPosition(a.newHire.position),
    confirmed: a.confirmed as ConfirmStatus,
    travelStatus: a.travelStatus as TravelStatus,
    ipadReady: a.ipadReady,
    cardReady: a.cardReady,
    swagReady: a.swagReady,
    sentTemplateKeys: parseKeys(a.sentTemplateKeys)
  }));

  const attendeeHireIds = new Set(s.attendees.map((a) => a.newHireId));
  const sessionDay = s.date.toISOString().slice(0, 10);
  const hires = await prisma.newHire.findMany({
    where: { id: { notIn: [...attendeeHireIds] } },
    select: { id: true, name: true, position: true, orientationDate: true, stage: true },
    orderBy: { name: "asc" }
  });
  const candidates: SessionCandidate[] = hires.map((h) => ({
    id: h.id,
    name: h.name,
    position: h.position,
    suggested: h.orientationDate ? h.orientationDate.toISOString().slice(0, 10) === sessionDay : false
  }));
  // suggested first
  candidates.sort((a, b) => Number(b.suggested) - Number(a.suggested) || a.name.localeCompare(b.name));

  return {
    id: s.id,
    date: s.date.toISOString(),
    location: s.location,
    address: s.address,
    meetLink: s.meetLink,
    notes: s.notes,
    status: s.status as SessionStatus,
    attendees,
    prepTasks: s.prepTasks.map((t) => ({ id: t.id, label: t.label, owner: t.owner, dueDaysBefore: t.dueDaysBefore, done: t.done })),
    headcount: {
      total: attendees.length,
      outOfTown: attendees.filter((a) => a.travelStatus !== "NA").length,
      pilots: attendees.filter((a) => a.isPilot).length,
      confirmed: attendees.filter((a) => a.confirmed === "CONFIRMED").length
    },
    candidates,
    templates: await getEmailTemplates()
  };
}

export async function createOrientationSession(input: {
  date: Date;
  location?: string | null;
  address?: string | null;
  meetLink?: string | null;
  attendeeHireIds?: string[];
}) {
  const session = await prisma.orientationSession.create({
    data: {
      date: input.date,
      location: input.location ?? "SkyShare HQ, Salt Lake City",
      address: input.address ?? null,
      meetLink: input.meetLink ?? null,
      prepTasks: {
        create: DEFAULT_PREP_TASKS.map((t, i) => ({ label: t.label, owner: t.owner, dueDaysBefore: t.dueDaysBefore, order: i }))
      }
    }
  });
  if (input.attendeeHireIds?.length) {
    await prisma.orientationAttendee.createMany({
      data: input.attendeeHireIds.map((newHireId) => ({ sessionId: session.id, newHireId })),
      skipDuplicates: true
    });
  }
  return session;
}

// ---- Cohorts: pre-onboarding hires grouped by their orientation date ----

export type CohortHire = { id: string; name: string; position: string | null; isAttendee: boolean };
export type Cohort = {
  dateISO: string;
  hires: CohortHire[];
  sessionId: string | null;
  missingHireIds: string[];
};
export type CalendarDay = { dateISO: string; hireCount: number; sessionId: string | null };
export type CohortData = { cohorts: Cohort[]; calendar: CalendarDay[] };

export async function getOrientationCohorts(): Promise<CohortData> {
  const [hires, sessions] = await Promise.all([
    prisma.newHire.findMany({
      where: { stage: "ACTIVE", orientationDate: { not: null } },
      select: { id: true, name: true, position: true, orientationDate: true },
      orderBy: [{ orientationDate: "asc" }, { name: "asc" }]
    }),
    prisma.orientationSession.findMany({ select: { id: true, date: true, attendees: { select: { newHireId: true } } } })
  ]);

  const sessionByDay = new Map<string, { id: string; attendeeIds: Set<string> }>();
  for (const s of sessions) {
    sessionByDay.set(s.date.toISOString().slice(0, 10), { id: s.id, attendeeIds: new Set(s.attendees.map((a) => a.newHireId)) });
  }

  const byDay = new Map<string, typeof hires>();
  for (const h of hires) {
    const day = h.orientationDate!.toISOString().slice(0, 10);
    const arr = byDay.get(day) ?? [];
    arr.push(h);
    byDay.set(day, arr);
  }

  const cohorts: Cohort[] = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, hs]) => {
      const session = sessionByDay.get(day) ?? null;
      const cohortHires: CohortHire[] = hs.map((h) => ({
        id: h.id,
        name: h.name,
        position: h.position,
        isAttendee: session ? session.attendeeIds.has(h.id) : false
      }));
      return {
        dateISO: hs[0].orientationDate!.toISOString(),
        hires: cohortHires,
        sessionId: session?.id ?? null,
        missingHireIds: cohortHires.filter((h) => !h.isAttendee).map((h) => h.id)
      };
    });

  // Calendar markers: union of cohort days and session days.
  const calMap = new Map<string, CalendarDay>();
  for (const c of cohorts) {
    const day = c.dateISO.slice(0, 10);
    calMap.set(day, { dateISO: c.dateISO, hireCount: c.hires.length, sessionId: c.sessionId });
  }
  for (const s of sessions) {
    const day = s.date.toISOString().slice(0, 10);
    if (!calMap.has(day)) calMap.set(day, { dateISO: s.date.toISOString(), hireCount: 0, sessionId: s.id });
  }
  const calendar = [...calMap.values()].sort((a, b) => a.dateISO.localeCompare(b.dateISO));

  return { cohorts, calendar };
}

/** Mark complete and tick each attendee's "Attended orientation" pre-onboarding task. */
export async function completeOrientationSession(id: string) {
  const s = await prisma.orientationSession.findUnique({ where: { id }, select: { attendees: { select: { newHireId: true } } } });
  if (!s) return;
  await prisma.orientationSession.update({ where: { id }, data: { status: "COMPLETE" } });
  const hireIds = s.attendees.map((a) => a.newHireId);
  if (hireIds.length) {
    await prisma.onboardingTask.updateMany({
      where: { newHireId: { in: hireIds }, key: "attended_orientation" },
      data: { status: "DONE", completedAt: new Date() }
    });
  }
}
