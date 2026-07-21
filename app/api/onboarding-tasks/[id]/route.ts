import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { MAINTENANCE_GROUP } from "@/lib/onboarding/tasks";
import { maybeArchiveOnCheckinsComplete } from "@/lib/data/onboarding";
import { isOfferStepKey } from "@/lib/offers/steps";
import { syncOnboardingTaskToOffer } from "@/lib/offers/onboarding-sync";
import { syncCardStatusFromChecklist } from "@/lib/business-cards/checklist-sync";

type RouteContext = { params: Promise<{ id: string }> };

const VALID = ["TODO", "DONE", "NA"] as const;

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const body = (await request.json()) as { status?: string };
    const status = body.status;
    if (!status || !VALID.includes(status as (typeof VALID)[number])) {
      return NextResponse.json({ message: "Invalid status." }, { status: 400 });
    }

    const updated = await prisma.onboardingTask.update({
      where: { id },
      data: { status, completedAt: status === "DONE" ? new Date() : null }
    });

    // If this is one of the 6 OFFER steps, mirror it back to the offer on the
    // candidate's application (through the audited recordOfferStep path) so the
    // candidate's Offers tab + the offer status/dates stay in step. NA isn't an
    // offer concept, so only DONE/TODO write back.
    if (isOfferStepKey(updated.key) && status !== "NA") {
      await syncOnboardingTaskToOffer(updated.newHireId, updated.key, status === "DONE", { id: auth.user.id, email: auth.user.email });
    }

    // N/A on "Order business card" means this person isn't getting cards — move
    // them out of the Business cards outstanding list instead of leaving them
    // sitting there. Only touches NEEDED/NOT_NEEDED; see the sync for why.
    const cardSync = await syncCardStatusFromChecklist(updated.newHireId, updated.key, status);

    // Completing a check-in may be the last one — auto-archive if so.
    let archived = false;
    if (updated.group === MAINTENANCE_GROUP && status === "DONE") {
      archived = await maybeArchiveOnCheckinsComplete(updated.newHireId);
    }

    return NextResponse.json({ ok: true, task: { id: updated.id, status: updated.status }, archived, cardSync });
  } catch (error) {
    console.error("Onboarding task update error:", error);
    return NextResponse.json({ message: "Unable to update task." }, { status: 500 });
  }
}
