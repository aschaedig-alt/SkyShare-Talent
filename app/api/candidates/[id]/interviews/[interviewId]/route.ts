import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, authFailureResponse } from "@/lib/auth/route-auth";
import { hasPermission } from "@/lib/auth/roles";
import { canAnnotateCandidate, isCandidateVisible } from "@/lib/auth/candidate-scope";
import { logActivity } from "@/lib/activity/logger";
import { sanitizeRichText, richTextToPlain, extractMentions } from "@/lib/richtext/sanitize";
import { INTERVIEW_OUTCOMES, INTERVIEW_TYPES } from "@/lib/interviews/constants";
import { notifyMentions } from "@/lib/notifications/mentions";

/**
 * Normalise a posted co-interviewer list into storable JSON.
 *
 * Capped at 10 and de-duplicated by email so a runaway client cannot write an
 * unbounded blob. Returns null for an empty list, which is the same as "nobody
 * else was in the room" and keeps the column clean rather than storing "[]".
 */
function normalizeCoInterviewers(input: unknown): string | null {
  if (!Array.isArray(input)) return null;
  const seen = new Set<string>();
  const out: Array<{ name: string; email: string }> = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as { name?: unknown; email?: unknown };
    const email = String(r.email ?? "").trim().toLowerCase();
    const name = String(r.name ?? "").trim();
    if (!email && !name) continue;
    const key = email || name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, email });
    if (out.length >= 10) break;
  }
  return out.length ? JSON.stringify(out) : null;
}

/**
 * Edit or remove an interview WRITE-UP.
 *
 * Deliberately separate from /api/interviews/[id] — that route is the
 * scheduling flow (calendar:write, pushes to Google Calendar) and a logged
 * write-up has neither a calendar event nor that permission's blast radius.
 * Same reasoning as the POST route this pairs with.
 *
 * Same grant as that POST route too — an allowlist-scoped viewer may annotate a
 * candidate they were given — but narrower: they may only change a write-up of
 * their OWN interview. candidates:write is unchanged and still covers every one.
 */

type Ctx = { params: Promise<{ id: string; interviewId: string }> };

const forbidden = () =>
  NextResponse.json({ message: "You do not have permission to perform this action." }, { status: 403 });

const interviewNotFound = () => NextResponse.json({ message: "Interview not found." }, { status: 404 });

/**
 * Did this caller run this interview?
 *
 * Interview has no author column. The only identity it records is
 * interviewerEmail, which the schema itself keeps precisely because the
 * free-text interviewer NAME cannot answer "show me the ones I did" — two people
 * typing their own name differently is enough to break that. So that address is
 * what authorship means here, and a row with none recorded belongs to nobody and
 * stays off limits to an allowlisted annotator.
 *
 * Note this is who RAN the interview rather than who typed the write-up; they
 * are the same person for the flow this grant exists for, and the alternative is
 * no ownership signal at all.
 */
function ranIt(email: string | null, interviewerEmail: string | null | undefined): boolean {
  if (!email || !interviewerEmail) return false;
  return email.trim().toLowerCase() === interviewerEmail.trim().toLowerCase();
}

function clampRating(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const n = Math.round(value);
  return n >= 1 && n <= 5 ? n : undefined;
}

async function loadOwned(id: string, interviewId: string) {
  return prisma.interview.findFirst({
    where: { id: interviewId, candidateId: id },
    include: { candidate: { select: { id: true, displayName: true } } }
  });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireApiUser();
  if (!auth.ok) return authFailureResponse(auth);

  const { id, interviewId } = await ctx.params;

  // Off-allowlist candidates answer as if the interview simply is not there, so
  // the 404/403 split can never confirm that a person exists. Checked before the
  // lookup for that reason.
  if (!isCandidateVisible(auth.user.viewer, id)) return interviewNotFound();

  const canWriteAnyInterview = hasPermission(auth.user.role, "candidates:write");
  if (!canWriteAnyInterview && !canAnnotateCandidate(auth.user.viewer, id)) return forbidden();

  const existing = await loadOwned(id, interviewId);
  if (!existing) return interviewNotFound();

  // The per-row half of the grant. 403 rather than 404 is fine here: the
  // candidate is already one this viewer may read, so the interview's existence
  // is not news to them — only the right to change it is being refused.
  if (!canWriteAnyInterview && !ranIt(auth.user.email, existing.interviewerEmail)) return forbidden();

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  if (typeof body.notesHtml === "string") {
    const html = sanitizeRichText(body.notesHtml);
    const plain = richTextToPlain(html);
    if (plain.trim().length < 1) {
      return NextResponse.json({ message: "The write-up can't be emptied out — delete it instead." }, { status: 400 });
    }
    data.notesHtml = html.slice(0, 120000);
    data.notes = plain.slice(0, 20000);
    data.mentionsJson = (() => {
      const m = extractMentions(html);
      return m.length ? JSON.stringify(m) : null;
    })();
  }

  if (typeof body.interviewedAt === "string") {
    const when = new Date(body.interviewedAt);
    if (Number.isNaN(when.getTime())) {
      return NextResponse.json({ message: "That interview date isn't valid." }, { status: 400 });
    }
    data.startDateTime = when;
  }

  if (typeof body.interviewerEmail === "string" && body.interviewerEmail.trim()) {
    data.interviewerEmail = body.interviewerEmail.trim().toLowerCase();
    if (typeof body.interviewerName === "string") data.interviewer = body.interviewerName.trim() || data.interviewerEmail;
  }

  // The interview TYPE was previously fixed at creation, so a call logged as a
  // recruiter screen could never be corrected to a hiring-manager interview.
  // Reported Aug 20. The title follows the type unless it has been hand-edited.
  if (typeof body.interviewType === "string" && INTERVIEW_TYPES.some((t) => t.value === body.interviewType)) {
    data.interviewType = body.interviewType;
    if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  }

  if ("coInterviewers" in body) {
    data.coInterviewersJson = normalizeCoInterviewers(body.coInterviewers);
  }

  if (body.outcome === null || (typeof body.outcome === "string" && INTERVIEW_OUTCOMES.some((o) => o.value === body.outcome))) {
    data.outcome = body.outcome;
  }

  if ("rating" in body) {
    const rating = clampRating(body.rating);
    if (rating === undefined) return NextResponse.json({ message: "Rating has to be 1 to 5." }, { status: 400 });
    data.rating = rating;
  }

  if ("nextStep" in body) {
    data.nextStep =
      typeof body.nextStep === "string" && body.nextStep.trim() ? body.nextStep.trim().slice(0, 300) : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ message: "Nothing to update." }, { status: 400 });
  }

  const updated = await prisma.interview.update({ where: { id: interviewId }, data });

  // Only notify about mentions that are NEW in this edit, so re-saving a note
  // does not re-notify someone already told about it.
  if (typeof data.mentionsJson === "string" || data.mentionsJson === null) {
    const before = new Set(JSON.parse(existing.mentionsJson ?? "[]") as string[]);
    const after = new Set(JSON.parse((data.mentionsJson as string | null) ?? "[]") as string[]);
    const newlyMentioned = [...after].filter((e) => !before.has(e));
    if (newlyMentioned.length) {
      await notifyMentions({
        emails: newlyMentioned,
        candidateId: id,
        candidateName: existing.candidate.displayName,
        context: "interview",
        mentionedBy: auth.user?.email ?? null,
        interviewId
      });
    }
  }

  await logActivity({
    userId: auth.user?.id,
    userEmail: auth.user?.email || undefined,
    activityType: "CANDIDATE_EDITED",
    description: `Edited an interview write-up for ${existing.candidate.displayName}`,
    entityType: "Candidate",
    entityId: id,
    metadata: { interviewId }
  });

  return NextResponse.json({
    ok: true,
    interview: {
      id: updated.id,
      startDateTime: updated.startDateTime.toISOString(),
      interviewer: updated.interviewer,
      interviewerEmail: updated.interviewerEmail,
      notes: updated.notes,
      notesHtml: updated.notesHtml,
      outcome: updated.outcome,
      rating: updated.rating,
      nextStep: updated.nextStep
    }
  });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireApiUser();
  if (!auth.ok) return authFailureResponse(auth);

  const { id, interviewId } = await ctx.params;

  if (!isCandidateVisible(auth.user.viewer, id)) return interviewNotFound();

  const canWriteAnyInterview = hasPermission(auth.user.role, "candidates:write");
  if (!canWriteAnyInterview && !canAnnotateCandidate(auth.user.viewer, id)) return forbidden();

  const existing = await loadOwned(id, interviewId);
  if (!existing) return interviewNotFound();

  if (!canWriteAnyInterview && !ranIt(auth.user.email, existing.interviewerEmail)) return forbidden();

  await prisma.interview.delete({ where: { id: interviewId } });

  await logActivity({
    userId: auth.user?.id,
    userEmail: auth.user?.email || undefined,
    activityType: "CANDIDATE_EDITED",
    description: `Deleted an interview write-up for ${existing.candidate.displayName}`,
    entityType: "Candidate",
    entityId: id,
    metadata: { interviewId }
  });

  return NextResponse.json({ ok: true });
}
