/**
 * Demo seed: a variety of interviews across the current month so the Timeline
 * (and other calendar views) look populated. All rows are tagged
 * source: "seed-demo" so they can be found/removed later:
 *
 *   npx tsx scripts/seed-demo-interviews.ts          # insert
 *   npx tsx scripts/seed-demo-interviews.ts --clear  # remove demo rows
 */
import { prisma } from "../lib/prisma";

const YEAR = 2026;
const MONTH = 5; // June (0-based)
const TZ = "America/Denver";
const SOURCE = "seed-demo";

// Recruiting team / hiring managers — these become the avatar rows on the timeline.
const TEAM = ["Aimee Chen", "Marcus Hill", "Priya Nair", "Dustin Wu", "Sofia Reyes"];

// [day, hour, durationMin, interviewType, status, interviewer]
const PLAN: Array<[number, number, number, string, string, string]> = [
  [3, 9, 45, "RECRUITER_SCREEN", "COMPLETED", "Aimee Chen"],
  [4, 11, 60, "RECRUITER_SCREEN", "COMPLETED", "Dustin Wu"],
  [5, 14, 60, "HIRING_MANAGER", "COMPLETED", "Marcus Hill"],
  [9, 10, 90, "TECHNICAL", "COMPLETED", "Priya Nair"],
  [9, 13, 60, "RECRUITER_SCREEN", "SCHEDULED", "Aimee Chen"], // same-day stack w/ another Aimee row
  [10, 15, 60, "HIRING_MANAGER", "SCHEDULED", "Marcus Hill"],
  [11, 9, 45, "RECRUITER_SCREEN", "CANCELLED", "Dustin Wu"],
  [12, 11, 120, "PANEL", "SCHEDULED", "Sofia Reyes"],
  [16, 10, 60, "TECHNICAL", "SCHEDULED", "Priya Nair"],
  [16, 14, 60, "HIRING_MANAGER", "SCHEDULED", "Marcus Hill"],
  [17, 9, 45, "RECRUITER_SCREEN", "SCHEDULED", "Aimee Chen"],
  [18, 13, 90, "PANEL", "SCHEDULED", "Sofia Reyes"],
  [19, 11, 60, "FINAL", "SCHEDULED", "Marcus Hill"],
  [23, 10, 60, "TECHNICAL", "SCHEDULED", "Priya Nair"],
  [24, 15, 30, "OFFER", "SCHEDULED", "Aimee Chen"],
  [25, 9, 60, "RECRUITER_SCREEN", "SCHEDULED", "Dustin Wu"],
  [25, 13, 90, "PANEL", "SCHEDULED", "Sofia Reyes"],
  [26, 11, 60, "FINAL", "SCHEDULED", "Marcus Hill"]
];

async function main() {
  if (process.argv.includes("--clear")) {
    const { count } = await prisma.interview.deleteMany({ where: { source: SOURCE } });
    console.log(`Removed ${count} demo interview(s).`);
    return;
  }

  const candidates = await prisma.candidate.findMany({ select: { id: true, displayName: true } });
  const jobs = await prisma.job.findMany({ select: { id: true, title: true } });
  if (candidates.length === 0 || jobs.length === 0) {
    throw new Error("Need at least one candidate and one job to seed interviews.");
  }

  let created = 0;
  for (let idx = 0; idx < PLAN.length; idx += 1) {
    const [day, hour, duration, interviewType, status, interviewer] = PLAN[idx];
    const candidate = candidates[idx % candidates.length];
    const job = jobs[idx % jobs.length];
    const start = new Date(YEAR, MONTH, day, hour, 0, 0, 0);
    const end = new Date(start.getTime() + duration * 60 * 1000);

    await prisma.interview.create({
      data: {
        candidateId: candidate.id,
        jobId: job.id,
        title: `${job.title} interview`,
        interviewType,
        startDateTime: start,
        endDateTime: end,
        timezone: TZ,
        interviewer,
        location: "Video — Zoom",
        status,
        source: SOURCE
      }
    });
    created += 1;
  }

  console.log(`Created ${created} demo interview(s) across ${TEAM.length} team members in ${YEAR}-${MONTH + 1}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
