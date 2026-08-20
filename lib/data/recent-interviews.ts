import { prisma } from "@/lib/prisma";
import type { ViewerScope } from "@/lib/auth/viewer-scope";
import { candidateScopeWhere } from "@/lib/auth/candidate-scope";

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
  nextStep: string | null;
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
  /**
   * Required, and null is the deliberate "unrestricted" answer (local-dev
   * bypass). Not optional: every row here carries a 180-character excerpt of the
   * raw write-up, so a caller that forgets the viewer leaks assessment text.
   */
  viewer: ViewerScope | null;
}): Promise<RecentInterviewsResult> {
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - options.windowDays * 24 * 60 * 60 * 1000);

  // Null for everyone who is not allowlist-scoped, so both where clauses below
  // come out byte-identical to what they were for every existing user.
  //
  // Applied through the RELATION (candidate: { id: { in: ... } }) rather than the
  // candidateId column. candidateFieldScopeWhere() is the column-shaped helper and
  // would work, but it returns a Record keyed by column name, and spreading an
  // index-signature type into a Prisma where clause is not something worth being
  // clever about. This keeps the fragment precisely typed; the join is on an
  // indexed key inside an already date-bounded window.
  const scope = candidateScopeWhere(options.viewer);

  const interviews = await prisma.interview.findMany({
    where: {
      startDateTime: { gte: since, lte: now },
      ...(options.interviewerEmail ? { interviewerEmail: options.interviewerEmail.toLowerCase() } : {}),
      ...(scope ? { candidate: scope } : {})
    },
    orderBy: { startDateTime: "desc" },
    select: {
      id: true,
      startDateTime: true,
      interviewer: true,
      interviewerEmail: true,
      outcome: true,
      rating: true,
      nextStep: true,
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
      nextStep: i.nextStep,
      excerpt: (i.notes ?? "").replace(/\s+/g, " ").trim().slice(0, 180)
    });
  }

  // The picker is built from the window UNFILTERED BY INTERVIEWER, so choosing a
  // person never removes everyone else from the list you chose them from. That
  // exemption is about the interviewer filter only — the candidate allowlist
  // still applies, or the counts beside each name would total up interviews on
  // candidates this viewer cannot open, and a name could appear here solely
  // because of them. The other branch reuses the already-scoped `interviews`.
  const all = options.interviewerEmail
    ? await prisma.interview.findMany({
        where: {
          startDateTime: { gte: since, lte: now },
          interviewerEmail: { not: null },
          ...(scope ? { candidate: scope } : {})
        },
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
