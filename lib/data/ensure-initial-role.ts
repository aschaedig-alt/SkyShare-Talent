import { prisma } from "@/lib/prisma";
import { resolveFleetPosition } from "@/lib/fleet/positions";

/**
 * Ensure an employee has an initial role-journey entry.
 *
 * When a hire has a position + start date but no RoleAssignment yet, create the
 * first one (transitionType "HIRE") from their position, effective their start
 * date — so their profile journey shows "<position>, effective <start date>"
 * without anyone recording it by hand.
 *
 * Idempotent and safe:
 *  - never touches a hire that already has any role (so it won't duplicate or
 *    override a manually-recorded history),
 *  - does nothing until BOTH position and start date are known (a candidate with
 *    no start date yet gets no role),
 *  - swallows its own errors so a backfill can never break the create/update/
 *    profile-load that triggered it.
 *
 * Called on new-hire create, on new-hire update (so setting a start date later
 * seeds the role), and on employee-journey load (so existing hires backfill the
 * first time their profile is viewed).
 */
export async function ensureInitialRole(newHireId: string): Promise<void> {
  try {
    const hire = await prisma.newHire.findUnique({
      where: { id: newHireId },
      select: {
        position: true,
        department: true,
        startDate: true,
        _count: { select: { roleAssignments: true } }
      }
    });
    if (!hire) return;
    if (hire._count.roleAssignments > 0) return; // already has a journey — leave it

    const title = hire.position?.trim();
    if (!title || !hire.startDate) return; // need both to seed the first role

    const fp = resolveFleetPosition(title);
    await prisma.roleAssignment.create({
      data: {
        newHireId,
        title,
        fleetPositionSlug: fp?.slug ?? null,
        seat: fp?.seat ?? null,
        aircraft: fp?.aircraft ?? null,
        department: hire.department ?? null,
        startDate: hire.startDate,
        endDate: null,
        transitionType: "HIRE"
      }
    });
  } catch (error) {
    console.error("ensureInitialRole error:", error);
  }
}
