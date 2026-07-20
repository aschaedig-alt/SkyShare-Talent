import { prisma } from "@/lib/prisma";
import { normalizeEmail, normalizeName, splitCandidateName } from "@/lib/candidates/normalize";

/**
 * Guarantee a hire/employee has a linked Candidate record, so anything that keys
 * off a candidate (org-chart links, the offer↔onboarding flow, matcher exclusion)
 * has one to point at. Idempotent:
 *   1. already linked  → return that candidate.
 *   2. a candidate matches their email → link to it and return.
 *   3. otherwise create a MINIMAL candidate — origin MANUAL, scan-excluded as HIRED
 *      so it never clutters recruiting — and link it.
 * This is the same safe backfill used for the direct-hire orphans; centralised here
 * so there is one implementation.
 */
export async function ensureCandidateForHire(hireId: string): Promise<{ candidateId: string; displayName: string } | null> {
  const hire = await prisma.newHire.findUnique({
    where: { id: hireId },
    select: { id: true, name: true, personalEmail: true, phone: true, position: true, candidateId: true }
  });
  if (!hire) return null;

  if (hire.candidateId) {
    const c = await prisma.candidate.findUnique({ where: { id: hire.candidateId }, select: { displayName: true } });
    return { candidateId: hire.candidateId, displayName: c?.displayName ?? hire.name };
  }

  const normalizedEmail = normalizeEmail(hire.personalEmail);
  if (normalizedEmail) {
    const dupe = await prisma.candidate.findFirst({ where: { normalizedEmail }, select: { id: true, displayName: true } });
    if (dupe) {
      await prisma.newHire.update({ where: { id: hireId }, data: { candidateId: dupe.id } });
      return { candidateId: dupe.id, displayName: dupe.displayName };
    }
  }

  const { firstName, lastName, displayName } = splitCandidateName(hire.name);
  const created = await prisma.$transaction(async (tx) => {
    const c = await tx.candidate.create({
      data: {
        firstName,
        lastName,
        displayName,
        normalizedName: normalizeName(displayName),
        primaryEmail: hire.personalEmail?.trim() || null,
        normalizedEmail,
        currentTitle: hire.position?.trim() || null,
        status: "ACTIVE",
        stage: "Hired",
        source: "Employee backfill (org chart link)",
        origin: "MANUAL",
        scanExcludedReason: "HIRED",
        scanExcludedNote: "Existing employee backfilled so they are linkable on the org chart.",
        scanExcludedAt: new Date(),
        scanExcludedBy: "system:org-chart-link"
      }
    });
    if (normalizedEmail) {
      await tx.candidateContact.create({
        data: { candidateId: c.id, type: "EMAIL", value: hire.personalEmail!.trim(), normalized: normalizedEmail, isPrimary: true, source: "Employee backfill" }
      });
    }
    await tx.newHire.update({ where: { id: hireId }, data: { candidateId: c.id } });
    return c;
  });
  return { candidateId: created.id, displayName: created.displayName };
}
