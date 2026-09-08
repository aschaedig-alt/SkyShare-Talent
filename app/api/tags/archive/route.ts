import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { logActivity } from "@/lib/activity/logger";
import { getArchivedTags, saveArchivedTags } from "@/lib/data/tag-archive";

export const dynamic = "force-dynamic";

/**
 * Put a tag away, or bring it back.
 *
 * NOT A DELETE, and the difference is the point: every candidate keeps the tag,
 * the manage page keeps listing it with its counts, and restoring is one call.
 * Archiving only stops it filling the Tags column and the filter's normal list.
 *
 * Stored as a list of labels in a workspace setting rather than a column on Tag,
 * because this repo has no migrations — a schema change goes straight at the
 * live shared database — and archiving is a view preference, not a fact about
 * the tag. See lib/data/tag-archive.ts.
 */
export async function GET() {
  const auth = await requireApiPermission("candidates:read");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ archived: [...(await getArchivedTags())].sort() });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    labels?: unknown;
    archived?: unknown;
  };
  const labels = Array.isArray(body.labels)
    ? body.labels.filter((l): l is string => typeof l === "string").map((l) => l.trim()).filter(Boolean)
    : [];
  if (labels.length === 0) {
    return NextResponse.json({ message: "Which tag?" }, { status: 400 });
  }
  const archive = body.archived !== false;

  // Every label has to name a real tag. Archiving something that does not exist
  // would sit in the setting for ever with nothing to match it.
  const found = await prisma.tag.findMany({
    where: { normalized: { in: labels.map((l) => l.toLowerCase()) } },
    select: { label: true, normalized: true }
  });
  if (found.length === 0) {
    return NextResponse.json({ message: "No tag by that name." }, { status: 404 });
  }

  const current = await getArchivedTags();
  for (const t of found) {
    if (archive) current.add(t.normalized);
    else current.delete(t.normalized);
  }
  const saved = await saveArchivedTags([...current]);

  await logActivity({
    userId: auth.user?.id,
    userEmail: auth.user?.email || undefined,
    activityType: "CANDIDATE_EDITED",
    description:
      `${archive ? "Archived" : "Restored"} ${found.length} tag${found.length === 1 ? "" : "s"}: ` +
      found.map((t) => `"${t.label}"`).join(", ") +
      ` — nobody lost the tag, it is ${archive ? "hidden from" : "back in"} the list and filter`,
    entityType: "Workspace",
    entityId: "tags"
  });

  return NextResponse.json({ ok: true, archived: saved, changed: found.length });
}
