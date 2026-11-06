import { prisma } from "@/lib/prisma";
import type { ViewerScope } from "@/lib/auth/viewer-scope";
import { candidateScopeWhere } from "@/lib/auth/candidate-scope";
import { INTERVIEW_TYPE_META, type InterviewType } from "@/lib/calendar/interview-types";

/**
 * Every note written about a candidate in the last N days, newest first — the master
 * list beside Recent interviews. Asked for 2026-11-06, once Paycom notes started
 * arriving in the app by themselves: "a master view of recent notes ... 30, 60, and 90
 * days, all of that stuff".
 *
 * "Notes" means the two things a candidate's Notes tab shows together:
 *   - a candidate note (the Notes box), dated when it was written;
 *   - an interview write-up — typed in the app, or copied from Paycom by the Paycom notes
 *     scan — dated by the interview, the same date the profile orders it by.
 * One row per NOTE, not per candidate (Recent interviews is the per-person view): a
 * person with a recruiter screen and two hiring-manager write-ups shows three times,
 * because each is something to read.
 *
 * Private notes stay private: an HR-only candidate note is left out for anyone without
 * the HR permission, exactly as the profile does (lib/data/candidates.ts), and the
 * candidate allowlist applies to both kinds.
 */

export type RecentNoteKind = "note" | "interview";

export type RecentNoteRow = {
  id: string;
  kind: RecentNoteKind;
  /** "Note", or the interview type: "Hiring Manager", "Recruiter Screen". */
  label: string;
  title: string | null;
  candidateId: string;
  candidateName: string;
  stage: string | null;
  writtenAt: string;
  daysAgo: number;
  author: string | null;
  authorEmail: string | null;
  fromPaycom: boolean;
  hrOnly: boolean;
  excerpt: string;
};

export type RecentNotesResult = {
  rows: RecentNoteRow[];
  /** Everyone who wrote something in the window, for the picker — before the author filter. */
  authors: Array<{ email: string; name: string; count: number }>;
  counts: { note: number; interview: number };
  windowDays: number;
};

const MAX_ROWS = 500;

export async function getRecentNotes(options: {
  windowDays: number;
  authorEmail?: string | null;
  kind?: RecentNoteKind | null;
  now?: Date;
  /** Required; null is the deliberate local-dev "unrestricted" answer, as in recent-interviews. */
  viewer: ViewerScope | null;
}): Promise<RecentNotesResult> {
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - options.windowDays * 86_400_000);
  const scope = candidateScopeWhere(options.viewer);
  // The profile's own rule (lib/data/candidates.ts): HR-only notes need isHr, and no viewer is not HR.
  const isHr = Boolean(options.viewer?.isHr);
  const candidateSelect = { id: true, displayName: true, stage: true } as const;

  const [notes, interviews] = await Promise.all([
    prisma.candidateNote.findMany({
      where: {
        createdAt: { gte: since, lte: now },
        ...(isHr ? {} : { hrOnly: false }),
        ...(scope ? { candidate: scope } : {})
      },
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS,
      select: {
        id: true,
        body: true,
        source: true,
        hrOnly: true,
        createdAt: true,
        author: { select: { name: true, email: true } },
        candidate: { select: candidateSelect }
      }
    }),
    prisma.interview.findMany({
      where: {
        startDateTime: { gte: since, lte: now },
        notes: { not: null },
        NOT: { notes: "" },
        ...(scope ? { candidate: scope } : {})
      },
      orderBy: { startDateTime: "desc" },
      take: MAX_ROWS,
      select: {
        id: true,
        title: true,
        notes: true,
        source: true,
        interviewType: true,
        startDateTime: true,
        interviewer: true,
        interviewerEmail: true,
        candidate: { select: candidateSelect }
      }
    })
  ]);

  const daysAgo = (d: Date) => Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86_400_000));
  const excerpt = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, 240);

  const all: RecentNoteRow[] = [
    ...notes.map((n) => ({
      id: `note-${n.id}`,
      kind: "note" as const,
      label: "Note",
      title: null,
      candidateId: n.candidate.id,
      candidateName: n.candidate.displayName,
      stage: n.candidate.stage,
      writtenAt: n.createdAt.toISOString(),
      daysAgo: daysAgo(n.createdAt),
      author: n.author?.name ?? n.author?.email ?? null,
      authorEmail: n.author?.email?.toLowerCase() ?? null,
      fromPaycom: false,
      hrOnly: n.hrOnly,
      excerpt: excerpt(n.body)
    })),
    ...interviews.map((i) => ({
      id: `interview-${i.id}`,
      kind: "interview" as const,
      label: INTERVIEW_TYPE_META[i.interviewType as InterviewType]?.label ?? "Interview",
      title: i.title,
      candidateId: i.candidate.id,
      candidateName: i.candidate.displayName,
      stage: i.candidate.stage,
      writtenAt: i.startDateTime.toISOString(),
      daysAgo: daysAgo(i.startDateTime),
      author: i.interviewer,
      authorEmail: i.interviewerEmail?.toLowerCase() ?? null,
      fromPaycom: i.source === "paycom-note",
      hrOnly: false,
      excerpt: excerpt(i.notes)
    }))
  ].sort((a, b) => b.writtenAt.localeCompare(a.writtenAt));

  // The picker counts the whole window (both kinds), so choosing a person or a kind
  // never empties the list you chose from.
  const byEmail = new Map<string, { email: string; name: string; count: number }>();
  for (const r of all) {
    if (!r.authorEmail) continue;
    const current = byEmail.get(r.authorEmail);
    if (current) current.count += 1;
    else byEmail.set(r.authorEmail, { email: r.authorEmail, name: r.author || r.authorEmail, count: 1 });
  }

  const rows = all
    .filter((r) => !options.kind || r.kind === options.kind)
    .filter((r) => !options.authorEmail || r.authorEmail === options.authorEmail.toLowerCase())
    .slice(0, MAX_ROWS);

  return {
    rows,
    authors: [...byEmail.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    counts: { note: all.filter((r) => r.kind === "note").length, interview: all.filter((r) => r.kind === "interview").length },
    windowDays: options.windowDays
  };
}
