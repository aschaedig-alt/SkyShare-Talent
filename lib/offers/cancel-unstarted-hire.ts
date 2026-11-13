import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity/logger";
import { syncCandidateFromHire } from "@/lib/candidates/hire-lifecycle";

// When an offer ends before day one, the onboarding record has to say so.
//
// WHY (Nov 13 2026): Jordan Pashayan and Brandon Edwards had "Offer declined"
// recorded in August, but their onboarding records were only archived, never
// cancelled. Every list that asks "is this a current employee?" reads
// canceled = false + employmentStatus ACTIVE, so both went on being treated as
// employees: the Nov 11 candidate backfill marked them Current employee / Hired,
// and on Nov 13 they were brought back to Post-onboard for 6- and 12-month
// check-ins they would never have. His words: "Don't you have that information?
// How do we fix this so that there's no confusion later?"
//
// So recording an offer as DECLINED or NOT_SENT now does what the "Offer fell
// through" button does, for any of that candidate's hires that have not started:
// canceled = true (the hire files under Archived as did-not-start, record and
// history untouched - "They are coming after all" undoes it), then the same
// candidate re-sync the hire page runs.
//
// "HAS NOT STARTED" IS NARROW ON PURPOSE, so a real employee's record is never
// cancelled by a later declined offer (an internal move or a rehire they turned
// down). A hire is cancelled only when ALL of these hold:
//   - not already cancelled, and not terminated;
//   - never marked onboarded (onboardedAt is empty);
//   - its "Candidate signed offer letter" step EXISTS and is not done - imported
//     historical employees have no offer steps at all, so they never qualify;
//   - its "Attended orientation" step is not done;
//   - the candidate has no application whose offer is SIGNED (they took a
//     different offer instead).

export async function cancelUnstartedHiresForClosedOffer(
  candidateId: string,
  how: "DECLINED" | "NOT_SENT",
  actor?: { id?: string | null; email?: string | null } | null
): Promise<string[]> {
  try {
    const signedElsewhere = await prisma.candidateApplication.count({ where: { candidateId, offerStatus: "SIGNED" } });
    if (signedElsewhere > 0) return [];
    const hires = await prisma.newHire.findMany({
      where: { candidateId, canceled: false, employmentStatus: { not: "TERMINATED" }, onboardedAt: null },
      select: { id: true, name: true, tasks: { where: { key: { in: ["candidate_signed", "attended_orientation"] } }, select: { key: true, status: true } } }
    });
    const cancelled: string[] = [];
    for (const h of hires) {
      const signed = h.tasks.find((t) => t.key === "candidate_signed");
      const oriented = h.tasks.find((t) => t.key === "attended_orientation");
      if (!signed || signed.status === "DONE" || oriented?.status === "DONE") continue;
      await prisma.newHire.update({ where: { id: h.id }, data: { canceled: true } });
      const why = how === "DECLINED" ? "the offer was declined" : "the offer was not sent";
      await syncCandidateFromHire(h.id, `Hire canceled automatically: ${why}.`);
      await logActivity({
        userId: actor?.id ?? undefined,
        userEmail: actor?.email ?? undefined,
        activityType: "CANDIDATE_EDITED",
        description: `Onboarding record for ${h.name} moved to Archived as did not start: ${why}`,
        entityType: "NewHire",
        entityId: h.id
      });
      cancelled.push(h.name);
    }
    return cancelled;
  } catch (error) {
    // Never fail the offer change because the hire could not be updated.
    console.error("Cancel unstarted hire after a closed offer failed:", candidateId, error);
    return [];
  }
}
