import { prisma } from "@/lib/prisma";
import type { LlmTravelEmail } from "@/lib/extraction/travel-email-llm";

/**
 * Decide WHICH person a travel email is about.
 *
 * The naive rule — "anyone whose address is on the thread" — is wrong, and
 * measurably so. The first real email had five SkyShare addresses on it: the
 * traveller, the coordinator who booked it, the traveller's supervisor, a
 * director and the recruiting manager. Four of those five must not receive a
 * trip.
 *
 * So a recipient address is treated as WEAK evidence and never decides on its
 * own. What actually identifies the traveller:
 *
 *   - the name in the email matching a roster name
 *   - being an ACTIVE new hire rather than a long-tenured employee
 *   - having an orientation date that lines up with the trip
 *
 * The sender is excluded outright: a coordinator writing "I have you booked"
 * is not the one flying.
 *
 * Ambiguity is reported, never resolved by picking the top row. A trip filed
 * against the wrong person is worse than one a human has to assign.
 */

export type TravelerCandidate = {
  hireId: string;
  name: string;
  ssEmail: string | null;
  position: string | null;
  location: string | null;
  startDate: Date | null;
  orientationDate: Date | null;
  stage: string;
  candidateId: string | null;
  existingTrips: number;
  score: number;
  reasons: string[];
};

export type TravelerMatch = {
  best: TravelerCandidate | null;
  /** True when the best match is clear enough to pre-select in the UI. */
  confident: boolean;
  others: TravelerCandidate[];
  note: string;
};

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** "Tara" against "Tara Ward" — a first-name greeting is common in these emails. */
function firstNameOnlyMatch(stated: string, rosterName: string): boolean {
  const a = norm(stated), b = norm(rosterName);
  if (!a || a.includes(" ")) return false;
  return b.split(" ")[0] === a;
}

export async function matchTraveler(
  travel: LlmTravelEmail,
  threadAddresses: string[],
  senderEmail: string | null
): Promise<TravelerMatch> {
  const stated = travel.traveler_name.trim();
  const sender = norm(senderEmail);
  const addresses = threadAddresses.map(norm).filter((a) => a && a !== sender);

  const rows = await prisma.newHire.findMany({
    where: {
      OR: [
        ...(stated ? [{ name: { contains: stated.split(" ")[0], mode: "insensitive" as const } }] : []),
        ...(travel.traveler_email
          ? [{ ssEmail: { equals: travel.traveler_email, mode: "insensitive" as const } }]
          : []),
        { ssEmail: { in: addresses, mode: "insensitive" as const } },
        { personalEmail: { in: addresses, mode: "insensitive" as const } }
      ]
    },
    select: {
      id: true, name: true, ssEmail: true, personalEmail: true, position: true, location: true,
      startDate: true, orientationDate: true, stage: true, candidateId: true,
      _count: { select: { travelTrips: true } }
    }
  });

  // The earliest travel date in the email, used to test an orientation date.
  const tripDay = travel.segments.map((s) => s.date).filter(Boolean).sort()[0] ?? travel.indoc_date ?? "";

  const scored: TravelerCandidate[] = [];
  for (const r of rows) {
    // The sender booked the travel; they are not the traveller.
    if (sender && (norm(r.ssEmail) === sender || norm(r.personalEmail) === sender)) continue;

    const reasons: string[] = [];
    let score = 0;

    if (stated && norm(r.name) === norm(stated)) {
      score += 60;
      reasons.push(`name matches "${stated}" exactly`);
    } else if (stated && firstNameOnlyMatch(stated, r.name)) {
      score += 15;
      reasons.push(`first name matches "${stated}"`);
    }

    if (travel.traveler_email && norm(r.ssEmail) === norm(travel.traveler_email)) {
      score += 40;
      reasons.push("email address stated in the message");
    }

    if (r.stage === "ACTIVE") {
      score += 25;
      reasons.push("active new hire");
    } else {
      score -= 15;
      reasons.push(`stage is ${r.stage} — an existing employee, not an arriving hire`);
    }

    if (r.orientationDate) {
      const day = r.orientationDate.toISOString().slice(0, 10);
      if (tripDay && day === tripDay) {
        score += 35;
        reasons.push(`orientation is ${day}, the same day as the travel`);
      } else if (tripDay) {
        const gap = Math.abs(Date.parse(day) - Date.parse(tripDay)) / 86_400_000;
        if (gap <= 3) {
          score += 20;
          reasons.push(`orientation ${day} is within ${Math.round(gap)} day(s) of the travel`);
        }
      } else {
        score += 10;
        reasons.push(`has an orientation date (${day})`);
      }
    }

    if (addresses.includes(norm(r.ssEmail)) || addresses.includes(norm(r.personalEmail))) {
      score += 8;
      reasons.push("on the email thread");
    }

    if (score > 0) {
      scored.push({
        hireId: r.id, name: r.name, ssEmail: r.ssEmail, position: r.position, location: r.location,
        startDate: r.startDate, orientationDate: r.orientationDate, stage: r.stage,
        candidateId: r.candidateId, existingTrips: r._count.travelTrips, score, reasons
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const [best, runnerUp] = scored;

  if (!best) {
    return { best: null, confident: false, others: [], note: `No roster match for "${stated || "(no name)"}".` };
  }

  // A clear winner needs both an absolute floor and daylight over second place,
  // so "two people called Ward" never silently resolves to whichever sorted first.
  const margin = best.score - (runnerUp?.score ?? 0);
  const confident = best.score >= 70 && margin >= 25;

  return {
    best,
    confident,
    others: scored.slice(1, 5),
    note: confident
      ? `${best.name} — ${best.reasons.join("; ")}.`
      : runnerUp
        ? `Not clear-cut: ${best.name} (${best.score}) barely leads ${runnerUp.name} (${runnerUp.score}). Needs a human to pick.`
        : `${best.name} is the only candidate but the evidence is thin (${best.score}). Needs confirming.`
  };
}
