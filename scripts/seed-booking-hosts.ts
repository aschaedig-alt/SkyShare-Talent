/**
 * Demo seed: booking hosts (the recruiting team) with weekly availability and
 * meeting types so the /scheduling admin and /book/<slug> public pages have data.
 * Host names match the interviewers used in seed-demo-interviews.ts so existing
 * seeded interviews count against each host's availability.
 *
 *   npx tsx scripts/seed-booking-hosts.ts          # insert (skips existing slugs)
 *   npx tsx scripts/seed-booking-hosts.ts --clear  # remove demo hosts
 */
import { prisma } from "../lib/prisma";

const TZ = "America/Denver";

// Mon–Fri, 9:00–12:00 and 13:00–17:00 (a lunch gap to show multiple windows/day).
const WEEKDAY_WINDOWS = [
  { startMinute: 9 * 60, endMinute: 12 * 60 },
  { startMinute: 13 * 60, endMinute: 17 * 60 }
];
const WEEKLY = [1, 2, 3, 4, 5].flatMap((dayOfWeek) =>
  WEEKDAY_WINDOWS.map((w) => ({ dayOfWeek, startMinute: w.startMinute, endMinute: w.endMinute }))
);

type HostSeed = {
  name: string;
  slug: string;
  role: string;
  title: string;
  bufferMinutes: number;
  types: Array<{ name: string; kind: string; durationMinutes: number; location: string }>;
};

const HOSTS: HostSeed[] = [
  {
    name: "Aimee Chen",
    slug: "aimee-chen",
    role: "RECRUITER",
    title: "Senior Recruiter",
    bufferMinutes: 10,
    types: [
      { name: "Candidate screen", kind: "INTERVIEW", durationMinutes: 30, location: "Video — Zoom" },
      { name: "Intro call", kind: "MEETING", durationMinutes: 30, location: "Phone" }
    ]
  },
  {
    name: "Dustin Wu",
    slug: "dustin-wu",
    role: "RECRUITER",
    title: "Recruiter",
    bufferMinutes: 0,
    types: [
      { name: "Candidate screen", kind: "INTERVIEW", durationMinutes: 30, location: "Video — Zoom" },
      { name: "Quick chat", kind: "MEETING", durationMinutes: 30, location: "Phone" }
    ]
  },
  {
    name: "Marcus Hill",
    slug: "marcus-hill",
    role: "HIRING_MANAGER",
    title: "Chief Pilot / Hiring Team",
    bufferMinutes: 10,
    types: [
      { name: "Hiring team interview", kind: "INTERVIEW", durationMinutes: 45, location: "Video — Zoom" },
      { name: "Team meeting", kind: "MEETING", durationMinutes: 30, location: "Video — Zoom" }
    ]
  },
  {
    name: "Priya Nair",
    slug: "priya-nair",
    role: "HIRING_MANAGER",
    title: "Director of Operations",
    bufferMinutes: 10,
    types: [
      { name: "Hiring team interview", kind: "INTERVIEW", durationMinutes: 60, location: "Video — Zoom" },
      { name: "Intro meeting", kind: "MEETING", durationMinutes: 30, location: "Video — Zoom" }
    ]
  },
  {
    name: "Sofia Reyes",
    slug: "sofia-reyes",
    role: "RECRUITER",
    title: "Talent Coordinator",
    bufferMinutes: 0,
    types: [
      { name: "Panel coordination", kind: "MEETING", durationMinutes: 45, location: "Video — Zoom" },
      { name: "Candidate screen", kind: "INTERVIEW", durationMinutes: 30, location: "Phone" }
    ]
  }
];

async function main() {
  if (process.argv.includes("--clear")) {
    const { count } = await prisma.bookingHost.deleteMany({ where: { slug: { in: HOSTS.map((h) => h.slug) } } });
    console.log(`Removed ${count} demo host(s).`);
    return;
  }

  let created = 0;
  for (const h of HOSTS) {
    const existing = await prisma.bookingHost.findUnique({ where: { slug: h.slug }, select: { id: true } });
    if (existing) {
      console.log(`Skipping ${h.name} (slug ${h.slug} already exists).`);
      continue;
    }
    await prisma.bookingHost.create({
      data: {
        name: h.name,
        slug: h.slug,
        role: h.role,
        title: h.title,
        timezone: TZ,
        minNoticeHours: 6,
        bookingWindowDays: 90,
        bufferMinutes: h.bufferMinutes,
        isActive: true,
        weeklyRules: { create: WEEKLY },
        bookingTypes: {
          create: h.types.map((t, i) => ({
            name: t.name,
            kind: t.kind,
            durationMinutes: t.durationMinutes,
            location: t.location,
            sortOrder: i
          }))
        }
      }
    });
    created += 1;
  }
  console.log(`Created ${created} booking host(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
