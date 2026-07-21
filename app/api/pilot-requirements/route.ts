import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { logActivity } from "@/lib/activity/logger";
import { createPilotRequirementGates } from "@/lib/imports/job-import";
import { fleetPositionBySlug, activeFleetPositions } from "@/lib/fleet/positions";

/**
 * Create a pilot requirement by hand.
 *
 * Until now the only ways to get one were importing a job or flipping a job to
 * "pilot role" — so if a role wasn't already in an import, there was no way to
 * add it, and people reached for the PDF importer to do something it was never
 * meant to do.
 *
 * Built on the fleet position registry (FLEET_POSITIONS.md via
 * lib/fleet/positions.ts) rather than free text, so a new requirement lands on a
 * real, canonical role with the right slug and seat. That slug is what keeps one
 * requirement per role and stops the duplicates from creeping back.
 */

export async function GET() {
  const auth = await requireApiPermission("requirements:read");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  // Which roles don't have a current requirement yet — that's what's addable.
  const existing = await prisma.pilotRequirement.findMany({
    where: { status: { in: ["ACTIVE", "INACTIVE", "EVERGREEN"] }, fleetPositionSlug: { not: null } },
    select: { fleetPositionSlug: true }
  });
  const taken = new Set(existing.map((e) => e.fleetPositionSlug));

  return NextResponse.json({
    ok: true,
    positions: activeFleetPositions().map((p) => ({
      slug: p.slug,
      title: p.title,
      aircraft: p.aircraft,
      seat: p.seat,
      typeRating: p.typeRating,
      alreadyExists: taken.has(p.slug)
    }))
  });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("requirements:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json()) as { fleetPositionSlug?: string; operatorType?: string };
    const slug = typeof body.fleetPositionSlug === "string" ? body.fleetPositionSlug.trim() : "";
    if (!slug) return NextResponse.json({ message: "Pick a fleet position." }, { status: 400 });

    const position = fleetPositionBySlug(slug);
    if (!position) return NextResponse.json({ message: `Unknown fleet position "${slug}".` }, { status: 400 });

    // One current requirement per role. If a retired one exists for this role,
    // bring THAT back rather than making a second — otherwise consolidating the
    // duplicates would just be undone by the first person to click New.
    const current = await prisma.pilotRequirement.findFirst({
      where: { fleetPositionSlug: slug, status: { in: ["ACTIVE", "INACTIVE", "EVERGREEN"] } },
      select: { id: true, title: true }
    });
    if (current) {
      return NextResponse.json(
        { message: `"${current.title}" already exists for this role.`, existingId: current.id },
        { status: 409 }
      );
    }

    const retired = await prisma.pilotRequirement.findFirst({
      where: { fleetPositionSlug: slug },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true }
    });
    if (retired) {
      const restored = await prisma.pilotRequirement.update({
        where: { id: retired.id },
        data: { status: "ACTIVE" },
        select: { id: true, title: true }
      });
      await logActivity({
        activityType: "CANDIDATE_EDITED",
        description: `Restored retired pilot requirement "${restored.title}"`,
        entityType: "PilotRequirement",
        entityId: restored.id,
        metadata: { source: "new-requirement", fleetPositionSlug: slug, restored: true }
      });
      return NextResponse.json({ ok: true, id: restored.id, title: restored.title, restored: true });
    }

    const requirement = await prisma.pilotRequirement.create({
      data: {
        title: position.title,
        normalizedTitle: position.title.trim().toLowerCase(),
        fleetPositionSlug: position.slug,
        status: "ACTIVE",
        reviewStatus: "DRAFT",
        operatorType: body.operatorType === "Managed" ? "Managed" : "SkyShare",
        roleCategory: "Pilot",
        pilotSeat: position.seat,
        aircraftTypesJson: JSON.stringify([position.aircraft]),
        extractionConfidence: 100,
        extractionWarningsJson: JSON.stringify([]),
        sourceHistoryJson: JSON.stringify([
          { type: "created-by-hand", by: auth.user.email, createdAt: new Date().toISOString() }
        ])
      },
      select: { id: true, title: true }
    });

    // Seed the standard gate catalog so there is something to edit immediately.
    await createPilotRequirementGates(requirement.id, position.title);

    await logActivity({
      activityType: "CANDIDATE_EDITED",
      description: `Created pilot requirement "${requirement.title}"`,
      entityType: "PilotRequirement",
      entityId: requirement.id,
      metadata: { source: "new-requirement", fleetPositionSlug: slug }
    });

    return NextResponse.json({ ok: true, id: requirement.id, title: requirement.title });
  } catch (error) {
    console.error("Create pilot requirement error:", error);
    return NextResponse.json({ message: "Unable to create the requirement." }, { status: 500 });
  }
}
