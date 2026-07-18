import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { defaultTaskCreateData } from "@/lib/data/onboarding";
import { ensureCustomMilestoneTasks } from "@/lib/data/onboarding-milestones";
import { ensureInitialRole } from "@/lib/data/ensure-initial-role";
import { parseOfferSteps } from "@/lib/offers/steps";
import { suggestCompanyEmail } from "@/lib/people/company-email";

function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function strOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const t = String(value).trim();
  return t.length ? t : null;
}

/**
 * What this candidate's offer already knows: the ticked steps and the dates.
 * The SIGNED offer wins — that is the one they are actually joining on. Failing
 * that, take the offer that got furthest, so a sent-but-unsigned offer still
 * carries its work across rather than starting from nothing.
 */
async function loadOfferSteps(candidateId: string) {
  const apps = await prisma.candidateApplication.findMany({
    where: { candidateId },
    select: {
      offerStatus: true,
      offerStepsJson: true,
      offerSentAt: true,
      offerSignedAt: true,
      offerStartDate: true
    }
  });
  if (apps.length === 0) return undefined;

  const rank: Record<string, number> = { SIGNED: 5, SENT: 4, STARTED: 3, PLANNED: 2, DECLINED: 1, NONE: 0 };
  const best = [...apps].sort((a, b) => (rank[b.offerStatus] ?? 0) - (rank[a.offerStatus] ?? 0))[0];
  if (!best || (rank[best.offerStatus] ?? 0) === 0) return undefined;

  return {
    steps: parseOfferSteps(best.offerStepsJson),
    sentAt: best.offerSentAt,
    signedAt: best.offerSignedAt,
    startDate: best.offerStartDate
  };
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const name = strOrNull(body.name);
    if (!name) {
      return NextResponse.json({ message: "Name is required." }, { status: 400 });
    }

    const candidateId = strOrNull(body.candidateId);

    // Two hires for one candidate is the duplicate this whole flow exists to
    // prevent — the panel's "different person, create separate" escape and a
    // stale tab replayed both reach here around the branch that would have
    // linked instead.
    if (candidateId) {
      const already = await prisma.newHire.findFirst({
        where: { candidateId },
        select: { id: true, name: true }
      });
      if (already) {
        return NextResponse.json(
          { message: `${already.name} is already in onboarding from this candidate.`, id: already.id },
          { status: 409 }
        );
      }
    } else if (!body.force) {
      // No candidate behind this one (the walk-in / quick-add path), so the
      // candidate-level guard above can't fire. Guard on name instead: a second
      // quick-add of the same name is almost always the same person entered
      // twice. Same name CAN be two real people, so this is a soft 409 with a
      // force escape rather than a hard block — the caller can add anyway.
      const sameName = await prisma.newHire.findFirst({
        where: { name: { equals: name, mode: "insensitive" }, stage: { in: ["ACTIVE", "POST_ONBOARD"] } },
        select: { id: true, name: true, position: true }
      });
      if (sameName) {
        return NextResponse.json(
          {
            message: `A hire named ${sameName.name} already exists${sameName.position ? ` (${sameName.position})` : ""}. Open that one, or add anyway if this is a different person.`,
            existing: sameName,
            duplicate: true
          },
          { status: 409 }
        );
      }
    }

    // Carry across what was already ticked while they were still a candidate, so
    // the Offer group lands complete instead of asking for the same six ticks
    // twice. The offer they SIGNED wins; otherwise the furthest one along.
    const offer = candidateId ? await loadOfferSteps(candidateId) : undefined;

    // The company address follows a fixed convention (first initial + last name)
    // and feeds the business cards, so fill it in by default here rather than
    // only in the UI — every path that creates a hire should get it. But the
    // convention collides for real pairs on the roster (Kevin vs Kieran Sherman
    // both derive to ksherman@), so only take it when it is actually free: two
    // people sharing a mailbox is worse than a blank field someone fills in.
    let ssEmail = strOrNull(body.ssEmail);
    if (!ssEmail) {
      const suggestion = await suggestCompanyEmail(name);
      if (suggestion.email && !suggestion.takenBy) ssEmail = suggestion.email;
    }

    const hire = await prisma.newHire.create({
      data: {
        name,
        position: strOrNull(body.position),
        department: strOrNull(body.department),
        phone: strOrNull(body.phone),
        ssEmail,
        personalEmail: strOrNull(body.personalEmail),
        // Fall back to the dates the offer already knows, so they are not retyped.
        offerSentDate: parseDate(body.offerSentDate) ?? offer?.sentAt ?? null,
        offerSignedDate: parseDate(body.offerSignedDate) ?? offer?.signedAt ?? null,
        startDate: parseDate(body.startDate) ?? offer?.startDate ?? null,
        orientationDate: parseDate(body.orientationDate),
        stage: "ACTIVE",
        candidateId,
        tasks: { create: defaultTaskCreateData(offer?.steps) }
      }
    });

    await ensureCustomMilestoneTasks(hire.id);
    // Seed the first role-journey entry from position + start date (if both set).
    await ensureInitialRole(hire.id);

    return NextResponse.json({ ok: true, id: hire.id });
  } catch (error) {
    console.error("New hire create error:", error);
    return NextResponse.json({ message: "Unable to create new hire." }, { status: 500 });
  }
}
