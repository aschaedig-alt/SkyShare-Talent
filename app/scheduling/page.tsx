import { prisma } from "@/lib/prisma";
import { SchedulingAdmin, type AdminHost, type AdminOverride } from "@/components/scheduling/SchedulingAdmin";

export const dynamic = "force-dynamic";

export default async function SchedulingPage() {
  const hosts = await prisma.bookingHost.findMany({
    orderBy: { name: "asc" },
    include: {
      weeklyRules: { orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] },
      bookingTypes: { orderBy: { sortOrder: "asc" } }
    }
  });
  const overrides = await prisma.availabilityOverride.findMany({ orderBy: { startDate: "asc" } });

  const hostData: AdminHost[] = hosts.map((h) => ({
    id: h.id,
    name: h.name,
    slug: h.slug,
    email: h.email,
    role: h.role,
    title: h.title,
    timezone: h.timezone,
    calendarId: h.calendarId,
    minNoticeHours: h.minNoticeHours,
    bookingWindowDays: h.bookingWindowDays,
    maxPerDay: h.maxPerDay,
    bufferMinutes: h.bufferMinutes,
    isActive: h.isActive,
    weeklyRules: h.weeklyRules.map((r) => ({
      id: r.id,
      dayOfWeek: r.dayOfWeek,
      startMinute: r.startMinute,
      endMinute: r.endMinute
    })),
    bookingTypes: h.bookingTypes.map((t) => ({
      id: t.id,
      name: t.name,
      kind: t.kind,
      durationMinutes: t.durationMinutes,
      bufferMinutes: t.bufferMinutes,
      location: t.location,
      description: t.description,
      isActive: t.isActive,
      sortOrder: t.sortOrder
    }))
  }));

  const overrideData: AdminOverride[] = overrides.map((o) => ({
    id: o.id,
    hostId: o.hostId,
    startDate: o.startDate.toISOString().slice(0, 10),
    endDate: o.endDate.toISOString().slice(0, 10),
    kind: o.kind,
    startMinute: o.startMinute,
    endMinute: o.endMinute,
    label: o.label
  }));

  return <SchedulingAdmin hosts={hostData} overrides={overrideData} />;
}
