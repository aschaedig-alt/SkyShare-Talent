import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { isTagColor } from "@/lib/tags/colors";
import { logActivity } from "@/lib/activity/logger";
import { getCandidateTagOptions } from "@/lib/data/candidates";

export const dynamic = "force-dynamic";

/**
 * The tag vocabulary itself, as opposed to one candidate's tags.
 *
 * GET   — every tag with how many candidates carry it, for the picker and the
 *         filter. Counts are split live vs archived on purpose: 38 tags came in
 *         from Jazz carrying 1,648 links, but only 2 non-archived candidates
 *         have any tag at all, so a picker sorted by raw total would put
 *         "2.2 Pilot App Complete" (650 people, all archived) at the top and
 *         bury anything actually in use.
 * PATCH — recolour a tag. A Tag is shared by every candidate that carries it, so
 *         this deliberately changes it everywhere at once; that is what makes
 *         "colour Hot lead red" a one-time action rather than a per-person one.
 */

export async function GET() {
  const auth = await requireApiPermission("candidates:read");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  // Same function the candidates page uses, so the picker and the filter can
  // never disagree about which tags are historical or how they are ordered.
  return NextResponse.json({ tags: await getCandidateTagOptions() });
}

export async function PATCH(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    label?: unknown;
    color?: unknown;
    newLabel?: unknown;
  };
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label) return NextResponse.json({ message: "Which tag?" }, { status: 400 });

  const tag = await prisma.tag.findUnique({
    where: { normalized: label.toLowerCase() },
    select: { id: true, label: true }
  });
  if (!tag) return NextResponse.json({ message: "That tag does not exist." }, { status: 404 });

  // ---- RENAME ------------------------------------------------------------
  // A Tag is shared, so this renames it on every candidate carrying it at once.
  // No candidate row is touched: the link is by id, and the legacy free-text
  // tagsJson field is empty on all 3,615 candidates (checked), so there is no
  // second copy of the label to fall out of step.
  if (typeof body.newLabel === "string") {
    const newLabel = body.newLabel.trim();
    if (!newLabel) return NextResponse.json({ message: "Give the tag a name." }, { status: 400 });
    if (newLabel.length > 60) {
      return NextResponse.json({ message: "That name is too long — keep it under 60 characters." }, { status: 400 });
    }
    const normalized = newLabel.toLowerCase();

    // Colliding with ANOTHER tag is a merge, not a rename, and doing it silently
    // would fold two vocabularies together without anybody asking for it.
    const clash = await prisma.tag.findUnique({ where: { normalized }, select: { id: true, label: true } });
    if (clash && clash.id !== tag.id) {
      return NextResponse.json(
        { message: `"${clash.label}" already exists. Merge into it instead of renaming.` },
        { status: 409 }
      );
    }

    const renamed = await prisma.tag.update({
      where: { id: tag.id },
      data: { label: newLabel, normalized },
      select: { label: true, color: true }
    });
    await logActivity({
      userId: auth.user?.id,
      userEmail: auth.user?.email || undefined,
      activityType: "CANDIDATE_EDITED",
      description: `Renamed the tag "${tag.label}" to "${newLabel}"`,
      entityType: "Workspace",
      entityId: "tags"
    });
    return NextResponse.json({ ok: true, tag: renamed });
  }

  // ---- RECOLOUR ----------------------------------------------------------
  if (!isTagColor(body.color)) return NextResponse.json({ message: "Unknown colour." }, { status: 400 });

  const updated = await prisma.tag.update({
    where: { id: tag.id },
    data: { color: body.color },
    select: { label: true, color: true }
  });
  return NextResponse.json({ ok: true, tag: updated });
}

/**
 * Delete a tag outright.
 *
 * Removes it from every candidate carrying it — CandidateTag cascades on the
 * Tag delete. No distinction between a tag somebody typed and one the import
 * created: both are just rows, and "I do not want this label any more" is the
 * same wish either way.
 *
 * DIFFERENT FROM MERGE. Merge keeps the people and moves them to another label;
 * this drops the label AND everyone's link to it. Irreversible, so the count
 * goes in the response for the UI to confirm against, and both the name and the
 * count go in the activity log.
 */
export async function DELETE(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { label?: unknown };
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label) return NextResponse.json({ message: "Which tag?" }, { status: 400 });

  const tag = await prisma.tag.findUnique({
    where: { normalized: label.toLowerCase() },
    select: { id: true, label: true, _count: { select: { candidates: true } } }
  });
  if (!tag) return NextResponse.json({ message: "That tag does not exist." }, { status: 404 });

  const carried = tag._count.candidates;
  await prisma.tag.delete({ where: { id: tag.id } });

  await logActivity({
    userId: auth.user?.id,
    userEmail: auth.user?.email || undefined,
    activityType: "CANDIDATE_EDITED",
    description:
      `Deleted the tag "${tag.label}" — it was on ${carried} candidate${carried === 1 ? "" : "s"}, ` +
      `who no longer carry it`,
    entityType: "Workspace",
    entityId: "tags"
  });

  return NextResponse.json({ ok: true, removedFrom: carried });
}

/**
 * Merge one tag into another.
 *
 * Moves every candidate link from `from` onto `into`, then deletes `from`.
 * IRREVERSIBLE — once two tags are one, nothing records which candidates came
 * from which side — so the activity log carries the count and both names, and
 * the UI asks before calling this.
 *
 * The skip matters: CandidateTag is keyed on (candidateId, tagId), so anybody
 * already carrying BOTH tags would collide on the move. Those links are dropped
 * rather than moved, which is the same end state — they keep `into` either way.
 */
export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { from?: unknown; into?: unknown };
  const from = typeof body.from === "string" ? body.from.trim() : "";
  const into = typeof body.into === "string" ? body.into.trim() : "";
  if (!from || !into) return NextResponse.json({ message: "Merge which tag into which?" }, { status: 400 });
  if (from.toLowerCase() === into.toLowerCase()) {
    return NextResponse.json({ message: "That is the same tag." }, { status: 400 });
  }

  const [source, target] = await Promise.all([
    prisma.tag.findUnique({ where: { normalized: from.toLowerCase() }, select: { id: true, label: true } }),
    prisma.tag.findUnique({ where: { normalized: into.toLowerCase() }, select: { id: true, label: true } })
  ]);
  if (!source) return NextResponse.json({ message: `"${from}" does not exist.` }, { status: 404 });
  if (!target) return NextResponse.json({ message: `"${into}" does not exist.` }, { status: 404 });

  const moved = await prisma.$transaction(async (tx) => {
    const links = await tx.candidateTag.findMany({
      where: { tagId: source.id },
      select: { candidateId: true, source: true }
    });
    const alreadyOnTarget = new Set(
      (
        await tx.candidateTag.findMany({
          where: { tagId: target.id, candidateId: { in: links.map((l) => l.candidateId) } },
          select: { candidateId: true }
        })
      ).map((l) => l.candidateId)
    );

    const toCreate = links.filter((l) => !alreadyOnTarget.has(l.candidateId));
    if (toCreate.length) {
      await tx.candidateTag.createMany({
        data: toCreate.map((l) => ({ candidateId: l.candidateId, tagId: target.id, source: l.source }))
      });
    }
    // Deleting the tag cascades its links, so the source rows go with it.
    await tx.tag.delete({ where: { id: source.id } });
    return { linkCount: links.length, created: toCreate.length };
  });

  await logActivity({
    userId: auth.user?.id,
    userEmail: auth.user?.email || undefined,
    activityType: "CANDIDATE_EDITED",
    description:
      `Merged the tag "${source.label}" into "${target.label}" — ` +
      `${moved.linkCount} candidate${moved.linkCount === 1 ? "" : "s"} carried it, ` +
      `${moved.created} moved across (the rest already had "${target.label}")`,
    entityType: "Workspace",
    entityId: "tags"
  });

  return NextResponse.json({ ok: true, ...moved, into: target.label });
}
