import type { TravelItemView } from "@/lib/data/travel";

/**
 * Work out which flight rows are legs of the SAME booking.
 *
 * THE RULE COMES FROM THE REAL DATA, not from asking anyone to type anything
 * new. Two real trips both showed it: a Denver round trip entered as two rows
 * both carrying confirmation GQHGHP, and a Boston one carrying GLVG7W twice —
 * fare on the first leg, an empty Cost box on the second. That empty box is not
 * missing data, it is the return half of one ticket, and it reads as an
 * oversight every time someone opens the trip.
 *
 * So: FLIGHT rows sharing a non-empty confirmation number are one booking. Two
 * different confirmations are two one-way tickets with two fares, which is
 * exactly the distinction that was asked for.
 *
 * Deliberately narrow:
 *  - only FLIGHT rows group. A hotel and a flight can share a booking reference
 *    on a package, and calling that a round trip would be wrong.
 *  - a blank confirmation never groups. Several rows with no reference are not
 *    evidence of anything, and guessing would merge unrelated legs.
 *  - three or more legs sharing a reference is a multi-leg itinerary, not a
 *    round trip, and is labelled as such rather than forced into a shape.
 */

export type BookingGroup = {
  confirmation: string;
  itemIds: string[];
  /** Total across the group — normally one fare on the first leg. */
  amount: number;
  /** Two legs is a round trip; more is a multi-leg itinerary. */
  kind: "round-trip" | "multi-leg";
};

export type ItemBookingInfo = {
  group: BookingGroup;
  /** 1-based position, so a row can say "leg 2 of 2". */
  legNumber: number;
  /** True when this row carries the group's fare. */
  carriesFare: boolean;
};

function normalise(confirmation: string | null): string {
  return (confirmation ?? "").trim().toUpperCase();
}

export function buildBookingGroups(items: TravelItemView[]): Map<string, ItemBookingInfo> {
  const byConfirmation = new Map<string, TravelItemView[]>();
  for (const item of items) {
    if (item.type !== "FLIGHT") continue;
    const key = normalise(item.confirmation);
    if (!key) continue;
    const list = byConfirmation.get(key);
    if (list) list.push(item);
    else byConfirmation.set(key, [item]);
  }

  const result = new Map<string, ItemBookingInfo>();
  for (const [confirmation, legs] of byConfirmation) {
    if (legs.length < 2) continue; // a single leg is just a flight
    const group: BookingGroup = {
      confirmation,
      itemIds: legs.map((l) => l.id),
      amount: legs.reduce((sum, l) => sum + (l.amount ?? 0), 0),
      kind: legs.length === 2 ? "round-trip" : "multi-leg"
    };
    legs.forEach((leg, index) => {
      result.set(leg.id, {
        group,
        legNumber: index + 1,
        // The fare sits on whichever leg actually carries an amount. Falling
        // back to the first leg keeps the label sensible when nobody has
        // entered a cost yet.
        carriesFare: (leg.amount ?? 0) > 0 || (group.amount === 0 && index === 0)
      });
    });
  }
  return result;
}

export function bookingLabel(info: ItemBookingInfo): string {
  const what = info.group.kind === "round-trip" ? "Round trip" : "Multi-leg";
  return `${what} · leg ${info.legNumber} of ${info.group.itemIds.length}`;
}
