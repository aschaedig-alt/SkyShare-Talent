import { prisma } from "@/lib/prisma";

/**
 * Candidates interviewed in the last N days — the "who am I working on right
 * now" view.
 *
 * Counted from the interview DATE, not when the write-up was typed, so pasting
 * last week's notes today still files the candidate under last week.
 *
 * `interviewerEmail` narrows it to one person's own interviews, which is the
 * normal use: several people interview, and "recent" means recent to YOU.
 * Identity is the email rather than the free-text name, because two people
 * typing their own name differently is enough to break the filter.
 */

export type RecentInterviewRow = {
  candidateId: string;
  candidateName: string;
  currentTitle: string | null;
  stage: string | null;
  interviewId: string;
  interviewedAt: string;
  daysAgo: number;
  interviewer: string | null;
  interviewerEmail: string | null;
  outcome: string | null;
  rating: number | null;
  excerpt: string;
};

export type RecentInterviewsResult = {
  rows: RecentInterviewRow[];
  /** Every interviewer seen in the window, for the picker. */
  interviewers: Array<{ email: string; name: string; count: number }>;
  windowDays: number;
};

export async function getRecentInterviews(options: {
  windowDays: number;
  interviewerEmail?: string | null;
  now?: Date;
}): Promise<RecentInterviewsResult> {
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - options.windowDays * 24 * 60 * 60 * 1000);

  const interviews = await prisma.interview.findMany({
    where: {
      startDateTime: { gte: since, lte: now },
      ...(options.interviewerEmail ? { interviewerEmail: options.interviewerEmail.toLowerCase() } : {})
    },
    orderBy: { startDateTime: "desc" },
    select: {
      id: true,
      startDateTime: true,
      interviewer: true,
      interviewerEmail: true,
      outcome: true,
      rating: true,
      notes: true,
      candidate: { select: { id: true, displayName: true, currentTitle: true, stage: true } }
    }
  });

  // One row per CANDIDATE — their most recent interview in the window. Someone
  // interviewed twice is one person to follow up, not two.
  const seen = new Set<string>();
  const rows: RecentInterviewRow[] = [];
  for (const i of interviews) {
    if (!i.candidate || seen.has(i.candidate.id)) continue;
    seen.add(i.candidate.id);
    rows.push({
      candidateId: i.candidate.id,
      candidateName: i.candidate.displayName,
      currentTitle: i.candidate.currentTitle,
      stage: i.candidate.stage,
      interviewId: i.id,
      interviewedAt: i.startDateTime.toISOString(),
      daysAgo: Math.max(0, Math.floor((now.getTime() - i.startDateTime.getTime()) / 86_400_000)),
      interviewer: i.interviewer,
      interviewerEmail: i.interviewerEmail,
      outcome: i.outcome,
      rating: i.rating,
      excerpt: (i.notes ?? "").replace(/\s+/g, " ").trim().slice(0, 180)
    });
  }

  // The picker is built from the UNFILTERED window, so choosing a person never
  // removes everyone else from the list you chose them from.
  const all = options.interviewerEmail
    ? await prisma.interview.findMany({
        where: { startDateTime: { gte: since, lte: now }, interviewerEmail: { not: null } },
        select: { interviewer: true, interviewerEmail: true }
      })
    : interviews.map((i) => ({ interviewer: i.interviewer, interviewerEmail: i.interviewerEmail }));

  const byEmail = new Map<string, { email: string; name: string; count: number }>();
  for (const i of all) {
    if (!i.interviewerEmail) continue;
    const email = i.interviewerEmail.toLowerCase();
    const current = byEmail.get(email);
    if (current) current.count += 1;
    else byEmail.set(email, { email, name: i.interviewer || email, count: 1 });
  }

  return {
    rows,
    interviewers: [...byEmail.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    windowDays: options.windowDays
  };
}
