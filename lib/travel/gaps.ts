// "Is this trip actually complete?" — derived purely from what the trip already
// knows. No external data source, no flight-schedule lookup, no guessing at
// times: just the gaps that are obvious from the items and dates on the record.
//
// The bar for firing is deliberately high. A false "you forgot the hotel" on a
// trip that is fine trains people to ignore the prompts, so every rule below
// either has hard evidence or stays quiet. In particular we read the free-text
// fields before claiming something is missing — real trips record things like
// "Auggie is booking his own rental car" in specialRequests rather than as a
// CAR item, and prompting to book a car that is already handled is noise.

import type { TravelTripView } from "@/lib/data/travel";
import { tripRange, itemHasNoDate } from "@/lib/travel/schedule";

export type TravelGapSeverity = "action" | "info";

export type TravelGap = {
  id: string;
  severity: TravelGapSeverity;
  /** The question to put to the user. */
  title: string;
  /** Why we are asking — always cites what the trip does/doesn't have. */
  detail: string;
};

/** Free text on the trip where a human may have noted a booking in prose. */
function freeText(trip: TravelTripView): string {
  return [trip.specialRequests, trip.additionalTransport, trip.notes, trip.preferences]
    .filter(Boolean)
    .join(" \n ")
    .toLowerCase();
}

const mentionsGround = (text: string) =>
  /\b(rental|rent a car|car|uber|lyft|shuttle|taxi|limo|ride|driving|drove|drive|picked? up|pick[\s-]?up)\b/.test(text);

const mentionsLodging = (text: string) =>
  /\b(hotel|airbnb|lodging|staying|stay with|room|accommodation)\b/.test(text);

const mentionsReturn = (text: string) => /\b(one[\s-]?way|not returning|driving back|no return)\b/.test(text);

/**
 * The missing pieces on a trip, most actionable first.
 * Returns [] for trips where prompting makes no sense (canceled, or already
 * completed — the travel has happened, nothing left to book).
 */
export function findTravelGaps(trip: TravelTripView): TravelGap[] {
  if (trip.status === "CANCELED" || trip.status === "COMPLETED") return [];

  const gaps: TravelGap[] = [];
  const text = freeText(trip);
  const range = tripRange(trip);

  const flights = trip.items.filter((i) => i.type === "FLIGHT");
  const hotels = trip.items.filter((i) => i.type === "HOTEL");
  const ground = trip.items.filter((i) => i.type === "CAR" || i.type === "TRANSPORT");

  // Nothing on the trip at all. Everything below would fire at once and say the
  // same thing five times, so this replaces them.
  if (trip.items.length === 0) {
    gaps.push({
      id: "empty",
      severity: "action",
      title: "Nothing is booked on this trip yet.",
      detail: "No flights, hotel, or ground transport have been added. Do we need to book this travel?"
    });
    return gaps;
  }

  // A flight out and nothing back. Two+ flights we treat as a round trip.
  if (flights.length === 1 && !mentionsReturn(text)) {
    gaps.push({
      id: "no-return-flight",
      severity: "action",
      title: "There is a flight out, but nothing booked back.",
      detail: trip.requestedReturn
        ? "A return date is requested on this trip but only one flight is booked. Do we need to book the return?"
        : "Only one flight is on this trip. Do we need to book a return flight?"
    });
  }

  // A multi-day stay with nowhere to sleep.
  if (range && range.days >= 2 && hotels.length === 0 && !mentionsLodging(text)) {
    gaps.push({
      id: "no-hotel",
      severity: "action",
      title: `No hotel booked across a ${range.days}-day stay.`,
      detail: `This trip spans ${range.days} days${
        range.inferred ? " (read from the booking details)" : ""
      } and has no hotel on it. Do we need to book lodging?`
    });
  }

  // They land, and then what? Only ask when they are actually flying in.
  if (flights.length > 0 && ground.length === 0 && !mentionsGround(text)) {
    gaps.push({
      id: "no-ground",
      severity: "action",
      title: "No rental car or ground transport.",
      detail: "This trip has flights but nothing to get them around once they land. Do we need to book a car or a ride?"
    });
  }

  // Dates. This is the one that bites in practice — see schedule.ts. An item
  // whose date we could only infer from its text still shows on the calendar,
  // so this only fires for items with no readable date at all.
  const undated = trip.items.filter(itemHasNoDate);
  if (undated.length > 0) {
    gaps.push({
      id: "undated-items",
      severity: "info",
      title: `${undated.length} ${undated.length === 1 ? "item has" : "items have"} no date.`,
      detail: `${
        undated.length === 1 ? "It will not" : "They will not"
      } show on the traveller's calendar until a date is set.`
    });
  }

  if (!range) {
    gaps.push({
      id: "no-dates",
      severity: "info",
      title: "This trip has no dates at all.",
      detail: "Without a requested arrival/return or dated items, this trip cannot be placed on a calendar."
    });
  }

  return gaps;
}

/** Trip-level roll-up for badges: how many things need a decision. */
export function countActionGaps(trip: TravelTripView): number {
  return findTravelGaps(trip).filter((g) => g.severity === "action").length;
}
