import { prisma } from "@/lib/prisma";
import { canEditScoring, getScoringConfigDoc } from "@/lib/matching/scoring-config.server";
import { profileKey, profileLabel, type ScoringConfigDoc } from "@/lib/matching/scoring-config";
import { fleetOrderIndex, fleetSeatRank } from "@/lib/fleet/positions";
import { parseStringArray } from "@/lib/json";

export type ScoringProfileOption = {
  key: string;
  aircraft: string | null;
  seat: string | null;
  label: string;
  count: number; // how many pilot requirements map to this profile
  configured: boolean; // has a saved override (vs. using defaults)
};

export type ScoringSetupData = {
  doc: ScoringConfigDoc;
  profiles: ScoringProfileOption[];
  canEdit: boolean;
};

// Best canonical order from the aircraft tag, falling back to the profile label
// ("Citation M2 · PIC" resolves even when a bare shared-rating tag can't).
function orderOf(profile: { aircraft: string | null; label: string }): number {
  return Math.min(fleetOrderIndex(profile.aircraft), fleetOrderIndex(profile.label));
}


export async function getScoringSetupData(): Promise<ScoringSetupData> {
  const [doc, rows, canEdit] = await Promise.all([
    getScoringConfigDoc(),
    prisma.pilotRequirement.findMany({
      where: { NOT: { sourceJobRecord: { mergedIntoJobId: { not: null } } } },
      select: { aircraftTypesJson: true, pilotSeat: true }
    }),
    canEditScoring()
  ]);

  const combos = new Map<string, ScoringProfileOption>();
  for (const row of rows) {
    const aircraft = parseStringArray(row.aircraftTypesJson)[0] ?? null;
    const seat = row.pilotSeat;
    const key = profileKey(aircraft, seat);
    const existing = combos.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      combos.set(key, {
        key,
        aircraft,
        seat,
        label: profileLabel(aircraft, seat),
        count: 1,
        configured: Boolean(doc.profiles[key])
      });
    }
  }

  const profiles: ScoringProfileOption[] = [
    {
      key: "__default__",
      aircraft: null,
      seat: null,
      label: "Default (all positions)",
      count: rows.length,
      configured: true
    },
    ...Array.from(combos.values()).sort(
      (a, b) =>
        orderOf(a) - orderOf(b) ||
        fleetSeatRank(a.seat) - fleetSeatRank(b.seat) ||
        a.label.localeCompare(b.label)
    )
  ];

  return { doc, profiles, canEdit };
}
