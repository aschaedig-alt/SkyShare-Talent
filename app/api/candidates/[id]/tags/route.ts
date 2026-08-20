import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { logActivity } from "@/lib/activity/logger";
import { autoTagColor, isTagColor } from "@/lib/tags/colors";
import { isCandidateVisible } from "@/lib/auth/candidate-scope";

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

/**
 * Add a tag to ONE candidate, creating the Tag if it does not exist yet.
 *
 * The counterpart to DELETE below, which shipped without it — so a tag taken off
 * by mistake could not be put back, and no new tag could be applied at all. Every
 * one of the 1,648 existing links came from the Jazz import; this is the first
 * way to make one by hand.
 *
 * Reuses an existing Tag case-insensitively rather than creating a near-duplicate:
 * "Hot lead" and "hot lead" must be the same tag or filtering by one silently
 * misses the other. New tags get a colour straight away, because a tag with no
 * colour renders the same grey as every other and the column stops being
 * scannable — which is the entire point of colouring them.
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;

  // Already covered by candidates:write, which no allowlistable role holds —
  // present so tagging cannot quietly become a way to write to a candidate this
  // viewer is not allowed to read, if that permission ever widens. Same 404 the
  // missing-candidate check below returns, and ahead of it so neither the read
  // nor the write happens.
  if (!isCandidateVisible(auth.user.viewer, id)) {
    return NextResponse.json({ message: "Candidate not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { label?: unknown; color?: unknown };
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label) return NextResponse.json({ message: "Give the tag a name." }, { status: 400 });
  if (label.length > 60) return NextResponse.json({ message: "That tag name is too long." }, { status: 400 });

  const candidate = await prisma.candidate.findUnique({
    where: { id },
    select: { id: true, displayName: true }
  });
  if (!candidate) return NextResponse.json({ message: "Candidate not found." }, { status: 404 });

  const normalized = label.toLowerCase();
  const color = isTagColor(body.color) ? body.color : autoTagColor(label);

  // Find-or-create on `normalized`, which is @unique — so two people adding the
  // same new tag at once cannot produce two Tag rows.
  let tag = await prisma.tag.findUnique({ where: { normalized }, select: { id: true, label: true, color: true } });
  if (!tag) {
    tag = await prisma.tag.create({
      data: { label, normalized, color },
      select: { id: true, label: true, color: true }
    });
  } else if (!tag.color) {
    // An existing tag that never had one (every Jazz tag) gets it now, so
    // colouring a tag once fixes it everywhere it appears.
    tag = await prisma.tag.update({
      where: { id: tag.id },
      data: { color },
      select: { id: true, label: true, color: true }
    });
  }

  const existing = await prisma.candidateTag.findUnique({
    where: { candidateId_tagId: { candidateId: id, tagId: tag.id } },
    select: { source: true }
  });
  if (existing) {
    // Already on this person. If it came from the import, adding it by hand is
    // how you say "this one is still relevant" — it PROMOTES the link to MANUAL
    // so it leaves the collapsed historical group and shows in colour. Without
    // this, choosing to keep a historical tag would silently do nothing, since
    // the join row already exists.
    if (existing.source !== "MANUAL") {
      await prisma.candidateTag.update({
        where: { candidateId_tagId: { candidateId: id, tagId: tag.id } },
        data: { source: "MANUAL" }
      });
      await logActivity({
        userId: auth.user?.id,
        userEmail: auth.user?.email || undefined,
        activityType: "CANDIDATE_EDITED",
        description: `Kept historical tag "${tag.label}" on ${candidate.displayName}`,
        entityType: "Candidate",
        entityId: id,
        metadata: { tag: tag.label, promoted: true }
      });
      return NextResponse.json({ ok: true, tag: { label: tag.label, color: tag.color }, promoted: true });
    }
    return NextResponse.json({ ok: true, tag: { label: tag.label, color: tag.color }, alreadyPresent: true });
  }

  await prisma.candidateTag.create({
    data: { candidateId: id, tagId: tag.id, source: "MANUAL" }
  });

  await logActivity({
    userId: auth.user?.id,
    userEmail: auth.user?.email || undefined,
    activityType: "CANDIDATE_EDITED",
    description: `Added tag "${tag.label}" to ${candidate.displayName}`,
    entityType: "Candidate",
    entityId: id,
    metadata: { tag: tag.label }
  });

  return NextResponse.json({ ok: true, tag: { label: tag.label, color: tag.color } });
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;

  // As on POST above: unreachable while candidates:write stays recruiter-and-up,
  // kept so removal is gated too rather than only addition.
  if (!isCandidateVisible(auth.user.viewer, id)) {
    return NextResponse.json({ message: "Candidate not found." }, { status: 404 });
  }

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
