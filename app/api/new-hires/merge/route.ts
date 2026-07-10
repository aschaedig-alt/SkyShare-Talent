import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";

// Merge two employee (NewHire) records into one. The caller picks which record is
// PRIMARY (survives) and which is SECONDARY (merges in + is deleted). All of the
// secondary's history moves to the primary; the primary keeps its own identity and
// only fills in fields it was missing. Irreversible — hence the explicit confirm UI.
export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  const body = (await request.json().catch(() => ({}))) as { primaryId?: unknown; secondaryId?: unknown };
  const primaryId = typeof body.primaryId === "string" ? body.primaryId : "";
  const secondaryId = typeof body.secondaryId === "string" ? body.secondaryId : "";

  if (!primaryId || !secondaryId) {
    return NextResponse.json({ message: "Pick a primary and a secondary record." }, { status: 400 });
  }
  if (primaryId === secondaryId) {
    return NextResponse.json({ message: "Can't merge a record into itself." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const primary = await tx.newHire.findUnique({ where: { id: primaryId } });
      const secondary = await tx.newHire.findUnique({ where: { id: secondaryId } });
      if (!primary || !secondary) throw new Error("not-found");

      // --- Move child relations secondary -> primary ---------------------------
      // Simple relations (no per-person uniqueness).
      await tx.roleAssignment.updateMany({ where: { newHireId: secondaryId }, data: { newHireId: primaryId } });
      await tx.employmentStint.updateMany({ where: { newHireId: secondaryId }, data: { newHireId: primaryId } });
      await tx.travelTrip.updateMany({ where: { newHireId: secondaryId }, data: { newHireId: primaryId } });
      await tx.redemption.updateMany({ where: { newHireId: secondaryId }, data: { newHireId: primaryId } });
      await tx.businessCardVariant.updateMany({ where: { newHireId: secondaryId }, data: { newHireId: primaryId } });
      await tx.recognition.updateMany({ where: { giverId: secondaryId }, data: { giverId: primaryId } });
      await tx.recognition.updateMany({ where: { recipientId: secondaryId }, data: { recipientId: primaryId } });

      // OnboardingTask is unique per (newHireId, key): only move keys the primary
      // doesn't already have; duplicates stay on the secondary and cascade-delete.
      const primaryTaskKeys = new Set(
        (await tx.onboardingTask.findMany({ where: { newHireId: primaryId }, select: { key: true } })).map((t) => t.key)
      );
      const secTasks = await tx.onboardingTask.findMany({ where: { newHireId: secondaryId }, select: { id: true, key: true } });
      const moveTaskIds = secTasks.filter((t) => !primaryTaskKeys.has(t.key)).map((t) => t.id);
      if (moveTaskIds.length) await tx.onboardingTask.updateMany({ where: { id: { in: moveTaskIds } }, data: { newHireId: primaryId } });

      // OrientationAttendee is unique per (sessionId, newHireId): same treatment.
      const primarySessions = new Set(
        (await tx.orientationAttendee.findMany({ where: { newHireId: primaryId }, select: { sessionId: true } })).map((a) => a.sessionId)
      );
      const secAtt = await tx.orientationAttendee.findMany({ where: { newHireId: secondaryId }, select: { id: true, sessionId: true } });
      const moveAttIds = secAtt.filter((a) => !primarySessions.has(a.sessionId)).map((a) => a.id);
      if (moveAttIds.length) await tx.orientationAttendee.updateMany({ where: { id: { in: moveAttIds } }, data: { newHireId: primaryId } });

      // --- Fill the primary's blank fields from the secondary ------------------
      const keepBlank = <T,>(a: T | null, b: T | null): T | null => (a !== null && a !== undefined && a !== "" ? a : b ?? null);
      const notes = [primary.notes, secondary.notes].filter(Boolean).join("\n\n").trim() || null;

      await tx.newHire.update({
        where: { id: primaryId },
        data: {
          legalName: keepBlank(primary.legalName, secondary.legalName),
          position: keepBlank(primary.position, secondary.position),
          department: keepBlank(primary.department, secondary.department),
          location: keepBlank(primary.location, secondary.location),
          managedAircraft: keepBlank(primary.managedAircraft, secondary.managedAircraft),
          phone: keepBlank(primary.phone, secondary.phone),
          ssEmail: keepBlank(primary.ssEmail, secondary.ssEmail),
          personalEmail: keepBlank(primary.personalEmail, secondary.personalEmail),
          offerSentDate: keepBlank(primary.offerSentDate, secondary.offerSentDate),
          offerSignedDate: keepBlank(primary.offerSignedDate, secondary.offerSignedDate),
          startDate: keepBlank(primary.startDate, secondary.startDate),
          orientationDate: keepBlank(primary.orientationDate, secondary.orientationDate),
          terminationDate: keepBlank(primary.terminationDate, secondary.terminationDate),
          birthday: keepBlank(primary.birthday, secondary.birthday),
          candidateId: keepBlank(primary.candidateId, secondary.candidateId),
          travelStatus: keepBlank(primary.travelStatus, secondary.travelStatus),
          businessCardTitle: keepBlank(primary.businessCardTitle, secondary.businessCardTitle),
          frequentFlyer: keepBlank(primary.frequentFlyer, secondary.frequentFlyer),
          hotelLoyalty: keepBlank(primary.hotelLoyalty, secondary.hotelLoyalty),
          rentalLoyalty: keepBlank(primary.rentalLoyalty, secondary.rentalLoyalty),
          avatarInitials: keepBlank(primary.avatarInitials, secondary.avatarInitials),
          notes,
          pdpGraduate: primary.pdpGraduate || secondary.pdpGraduate,
          managedPilot: primary.managedPilot || secondary.managedPilot,
          pointsBalance: primary.pointsBalance + secondary.pointsBalance
        }
      });

      // candidateId is unique; if the secondary held it and the primary now took it,
      // null it on the secondary first so the delete doesn't trip the constraint.
      await tx.newHire.update({ where: { id: secondaryId }, data: { candidateId: null, importKey: null } });
      await tx.newHire.delete({ where: { id: secondaryId } });

      return { primaryId, primaryName: primary.name, secondaryName: secondary.name };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Error && error.message === "not-found") {
      return NextResponse.json({ message: "One of the records no longer exists." }, { status: 404 });
    }
    console.error("Employee merge error:", error);
    return NextResponse.json({ message: "Unable to merge the records." }, { status: 500 });
  }
}
