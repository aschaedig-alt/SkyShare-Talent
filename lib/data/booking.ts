import { prisma } from "@/lib/prisma";
import { computeSlots, isSlotBookable, type HostForSlots, type BusyInterval, type DaySlots } from "@/lib/booking/slots";
import { listHostBusyEvents, getFreeBusy } from "@/lib/google/calendar";
import { tzDateParts, isoDate } from "@/lib/booking/timezone";

export type PublicBookingType = {
  id: string;
  name: string;
  kind: string;
  durationMinutes: number;
  bufferMinutes: number | null;
  location: string | null;
  description: string | null;
};

export type PublicHost = {
  id: string;
  name: string;
  slug: string;
  title: string | null;
  avatarUrl: string | null;
  role: string;
  timezone: string;
  bufferMinutes: number;
  minNoticeHours: number;
  bookingWindowDays: number;
  maxPerDay: number | null;
  isActive: boolean;
  bookingTypes: PublicBookingType[];
};

const hostInclude = {
  bookingTypes: { where: { isActive: true }, orderBy: { sortOrder: "asc" as const } },
  weeklyRules: true
};

/** Public host + active booking types (no internal settings leaked beyond what's needed). */
export async function getHostBySlug(slug: string) {
  return prisma.bookingHost.findUnique({ where: { slug }, include: hostInclude });
}

type HostWithRules = Awaited<ReturnType<typeof getHostBySlug>>;

/** Build the pure slot-engine view of a host (weekly rules + merged overrides). */
async function buildHostForSlots(host: NonNullable<HostWithRules>): Promise<HostForSlots> {
  // host-specific overrides + org-wide (hostId null) overrides both apply
  const overrides = await prisma.availabilityOverride.findMany({
    where: { OR: [{ hostId: host.id }, { hostId: null }] }
  });
  return {
    timezone: host.timezone,
    minNoticeHours: host.minNoticeHours,
    bookingWindowDays: host.bookingWindowDays,
    maxPerDay: host.maxPerDay,
    weeklyRules: host.weeklyRules.map((r) => ({
      dayOfWeek: r.dayOfWeek,
      startMinute: r.startMinute,
      endMinute: r.endMinute
    })),
    overrides: overrides.map((o) => ({
      startDate: o.startDate,
      endDate: o.endDate,
      kind: o.kind,
      startMinute: o.startMinute,
      endMinute: o.endMinute
    }))
  };
}

/**
 * Aggregate everything that makes a host "busy" in a window:
 *  - app bookings (CONFIRMED) for the host
 *  - app interviews tied to the host by interviewer name
 *  - host-tagged events on the shared Google Calendar
 *  - the host's personal Google calendar free/busy (if a calendarId is set)
 */
async function getHostBusy(
  host: { id: string; name: string; calendarId?: string | null },
  timeMin: Date,
  timeMax: Date
): Promise<BusyInterval[]> {
  const busy: BusyInterval[] = [];

  const bookings = await prisma.booking.findMany({
    where: {
      hostId: host.id,
      status: "CONFIRMED",
      startDateTime: { lt: timeMax },
      endDateTime: { gt: timeMin }
    },
    select: { startDateTime: true, endDateTime: true }
  });
  for (const b of bookings) busy.push({ start: b.startDateTime, end: b.endDateTime });

  const interviews = await prisma.interview.findMany({
    where: {
      interviewer: host.name,
      status: { not: "CANCELLED" },
      startDateTime: { lt: timeMax }
    },
    select: { startDateTime: true, endDateTime: true }
  });
  for (const iv of interviews) {
    busy.push({
      start: iv.startDateTime,
      end: iv.endDateTime ?? new Date(iv.startDateTime.getTime() + 60 * 60 * 1000)
    });
  }

  busy.push(...(await listHostBusyEvents(host.id, timeMin, timeMax)));
  const calId = (host as { calendarId?: string | null }).calendarId;
  if (calId) busy.push(...(await getFreeBusy([calId], timeMin, timeMax)));

  return busy;
}

/** Count of booked appointments per calendar date (host tz) for max-per-day. */
async function getBookedCountByDate(
  hostId: string,
  hostName: string,
  timezone: string,
  timeMin: Date,
  timeMax: Date
): Promise<Map<string, number>> {
  const [bookings, interviews] = await Promise.all([
    prisma.booking.findMany({
      where: { hostId, status: "CONFIRMED", startDateTime: { gte: timeMin, lt: timeMax } },
      select: { startDateTime: true }
    }),
    prisma.interview.findMany({
      where: { interviewer: hostName, status: { not: "CANCELLED" }, startDateTime: { gte: timeMin, lt: timeMax } },
      select: { startDateTime: true }
    })
  ]);

  const map = new Map<string, number>();
  for (const row of [...bookings, ...interviews]) {
    const p = tzDateParts(row.startDateTime, timezone);
    const key = isoDate(p.year, p.month, p.day);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

export type AvailabilityResult = {
  host: PublicHost;
  type: PublicBookingType | null;
  days: DaySlots[];
};

/** Compute bookable slots for a host + booking type. */
export async function getAvailableSlots(
  slug: string,
  typeId: string | null,
  from?: Date | null,
  to?: Date | null
): Promise<AvailabilityResult | null> {
  const host = await getHostBySlug(slug);
  if (!host || !host.isActive) return null;

  const publicHost = toPublicHost(host);
  const type = typeId
    ? publicHost.bookingTypes.find((t) => t.id === typeId) ?? null
    : publicHost.bookingTypes[0] ?? null;

  if (!type) return { host: publicHost, type: null, days: [] };

  const now = new Date();
  const windowEnd = new Date(now.getTime() + host.bookingWindowDays * 86_400_000);
  const rangeMin = from && from.getTime() > now.getTime() ? from : now;
  const rangeMax = to && to.getTime() < windowEnd.getTime() ? to : windowEnd;

  const [hostForSlots, busy, counts] = await Promise.all([
    buildHostForSlots(host),
    getHostBusy(host, rangeMin, rangeMax),
    getBookedCountByDate(host.id, host.name, host.timezone, rangeMin, rangeMax)
  ]);

  const days = computeSlots(
    hostForSlots,
    {
      durationMinutes: type.durationMinutes,
      bufferMinutes: type.bufferMinutes ?? host.bufferMinutes,
      from,
      to
    },
    busy,
    counts,
    now
  );

  return { host: publicHost, type, days };
}

/** Re-check at booking time that a requested start is still free. */
export async function checkSlotStillFree(
  host: NonNullable<HostWithRules>,
  type: { durationMinutes: number; bufferMinutes: number | null },
  requestedStart: Date
): Promise<boolean> {
  const now = new Date();
  const windowMin = new Date(requestedStart.getTime() - 2 * 60 * 60 * 1000);
  const windowMax = new Date(requestedStart.getTime() + (type.durationMinutes + 120) * 60 * 1000);
  const [hostForSlots, busy, counts] = await Promise.all([
    buildHostForSlots(host),
    getHostBusy(host, windowMin, windowMax),
    getBookedCountByDate(host.id, host.name, host.timezone,
      new Date(requestedStart.getTime() - 12 * 60 * 60 * 1000),
      new Date(requestedStart.getTime() + 12 * 60 * 60 * 1000))
  ]);

  return isSlotBookable(
    hostForSlots,
    { durationMinutes: type.durationMinutes, bufferMinutes: type.bufferMinutes ?? host.bufferMinutes },
    busy,
    counts,
    requestedStart,
    now
  );
}

export function toPublicHost(host: NonNullable<HostWithRules>): PublicHost {
  return {
    id: host.id,
    name: host.name,
    slug: host.slug,
    title: host.title,
    avatarUrl: host.avatarUrl,
    role: host.role,
    timezone: host.timezone,
    bufferMinutes: host.bufferMinutes,
    minNoticeHours: host.minNoticeHours,
    bookingWindowDays: host.bookingWindowDays,
    maxPerDay: host.maxPerDay,
    isActive: host.isActive,
    bookingTypes: host.bookingTypes.map((t) => ({
      id: t.id,
      name: t.name,
      kind: t.kind,
      durationMinutes: t.durationMinutes,
      bufferMinutes: t.bufferMinutes,
      location: t.location,
      description: t.description
    }))
  };
}
