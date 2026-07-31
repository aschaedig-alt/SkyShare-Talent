import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { isTagColor } from "@/lib/tags/colors";
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

  const body = (await request.json().catch(() => ({}))) as { label?: unknown; color?: unknown };
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label) return NextResponse.json({ message: "Which tag?" }, { status: 400 });
  if (!isTagColor(body.color)) return NextResponse.json({ message: "Unknown colour." }, { status: 400 });

  const tag = await prisma.tag.findUnique({ where: { normalized: label.toLowerCase() }, select: { id: true } });
  if (!tag) return NextResponse.json({ message: "That tag does not exist." }, { status: 404 });

  const updated = await prisma.tag.update({
    where: { id: tag.id },
    data: { color: body.color },
    select: { label: true, color: true }
  });
  return NextResponse.json({ ok: true, tag: updated });
}
