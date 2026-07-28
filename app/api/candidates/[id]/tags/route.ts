import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { logActivity } from "@/lib/activity/logger";

/**
 * Remove a tag from ONE candidate.
 *
 * WHY THIS EXISTS. Candidates imported from JazzHR carry that system's workflow
 * stage labels — "2.2 Pilot App Complete", "1.3 H Manager Interview Scheduled",
 * "2.3 EBCO Complete". They describe a process we no longer run, so on a
 * historical profile they are noise sitting directly under the person's name.
 * Until now tags were render-only, with no way to take one off.
 *
 * THE IMPORTANT DETAIL: this deletes the CandidateTag JOIN ROW, never the Tag
 * itself. A Tag is shared by every candidate that carries it, so deleting the
 * Tag would silently strip it from all of them. Removal is per person, which is
 * exactly the "as-needed basis" this was asked for.
 *
 * Tags live in two places for historical reasons — the normalized CandidateTag
 * join and a legacy tagsJson string array on the candidate. Both are handled, so
 * a label shown in the UI always disappears when removed regardless of which
 * store it came from.
 */

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { label?: unknown };
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label) {
    return NextResponse.json({ message: "Which tag should be removed?" }, { status: 400 });
  }

  const candidate = await prisma.candidate.findUnique({
    where: { id },
    select: {
      id: true,
      displayName: true,
      tagsJson: true,
      candidateTags: { include: { tag: { select: { id: true, label: true } } } }
    }
  });
  if (!candidate) return NextResponse.json({ message: "Candidate not found." }, { status: 404 });

  // Case-insensitive, because the two stores were populated by different
  // importers and their casing does not always agree.
  const wanted = label.toLowerCase();

  const joinRow = candidate.candidateTags.find((ct) => ct.tag.label.trim().toLowerCase() === wanted);
  if (joinRow) {
    await prisma.candidateTag.delete({
      where: { candidateId_tagId: { candidateId: id, tagId: joinRow.tag.id } }
    });
  }

  let legacyRemoved = false;
  if (candidate.tagsJson) {
    try {
      const parsed = JSON.parse(candidate.tagsJson) as unknown;
      if (Array.isArray(parsed)) {
        const kept = parsed.map(String).filter((t) => t.trim().toLowerCase() !== wanted);
        if (kept.length !== parsed.length) {
          await prisma.candidate.update({
            where: { id },
            data: { tagsJson: kept.length ? JSON.stringify(kept) : null }
          });
          legacyRemoved = true;
        }
      }
    } catch {
      /* malformed legacy JSON is left exactly as it was rather than guessed at */
    }
  }

  if (!joinRow && !legacyRemoved) {
    return NextResponse.json({ message: "That tag is not on this candidate." }, { status: 404 });
  }

  await logActivity({
    userId: auth.user?.id,
    userEmail: auth.user?.email || undefined,
    activityType: "CANDIDATE_EDITED",
    description: `Removed tag "${label}" from ${candidate.displayName}`,
    entityType: "Candidate",
    entityId: id,
    metadata: { tag: label }
  });

  return NextResponse.json({ ok: true, removed: label });
}
