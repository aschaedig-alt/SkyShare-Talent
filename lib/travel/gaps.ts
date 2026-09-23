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
//
// A TRIP NEEDS WHAT WAS ADDED TO IT, AND NOTHING ELSE (Aimee, Sep 11): "Not
// every trip requires a flight or a hotel. Sometimes people stay with friends
// or don't need a rental car." The booked-items list is add-only — a button
// press or a pasted confirmation puts a row on it, nothing is pre-seeded — so a
// hotel that was never added is a decision somebody is allowed to have made.
// The no-hotel and no-ground rules therefore ASK (severity "info") rather than
// flag: they stay visible on the open trip, but they no longer count toward the
// "N to book" badge or hold back "Everything is booked" on a trip that has all
// it needs. Before this, the only way to quiet them was knowing that words like
// "staying with" or "driving" in the notes switch them off.

import type { TravelItemView, TravelTripView } from "@/lib/data/travel";
import { tripRange, itemHasNoDate } from "@/lib/travel/schedule";
import { travelItemTypeLabel } from "@/lib/travel/constants";

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
 * Added, and never filled in: no vendor, confirmation, detail, cost or date.
 *
 * In a list that only ever holds what somebody added, this is the one shape of
 * placeholder left — an add button pressed and nothing typed. It must not count
 * as a booking, or "Everything is booked" ticks over a blank row. Checked
 * read-only when this was written: one live trip carries one, a Hotel row with
 * nothing on it, and it was counting as booked.
 */
export function isBlankItem(i: TravelItemView): boolean {
  return !i.vendor && !i.confirmation && !i.detail && i.amount === null && !i.startsAt && !i.endsAt;
}

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

  // Nothing on the trip at all — which is how EVERY trip starts, because items
  // are only ever added, never pre-filled. Still an action: an empty trip is not
  // a booked one, and saying "everything is booked" about it would be false.
  // The wording names no particular item on purpose. It used to say "no
  // flights, hotel, or ground transport", which read as though a new trip was
  // expected to have all three.
  if (trip.items.length === 0) {
    gaps.push({
      id: "empty",
      severity: "action",
      title: "Nothing has been added to this trip yet.",
      detail:
        "Add only what this trip needs with the buttons under Booked items, or paste a confirmation into Auto-fill and it adds the right item for you."
    });
    return gaps;
  }

  // Rows that were added and never filled in. An action: the row says somebody
  // meant to book it, and nothing says they did. Named by type so she can see
  // which button it was.
  const blank = trip.items.filter(isBlankItem);
  if (blank.length > 0) {
    gaps.push({
      id: "blank-items",
      severity: "action",
      title: `${blank.length} ${blank.length === 1 ? "item has" : "items have"} nothing filled in: ${blank
        .map((i) => travelItemTypeLabel(i.type))
        .join(", ")}.`,
      detail:
        "Added but never filled in. Fill in what was booked, or remove it with its bin icon if this trip does not need it."
    });
  }

  // A flight out and nothing back. Two+ flights we treat as a round trip. Still
  // an action, unlike the hotel and car below: a missing way home strands a
  // person, and a one-way trip is rare enough to be worth one sentence saying so.
  if (flights.length === 1 && !mentionsReturn(text)) {
    gaps.push({
      id: "no-return-flight",
      severity: "action",
      title: "There is a flight out, but nothing booked back.",
      detail:
        (trip.requestedReturn
          ? "A return date is requested on this trip but only one flight is booked. Do we need to book the return?"
          : "Only one flight is on this trip. Do we need to book a return flight?") +
        // The exact words mentionsReturn() listens for, so the promise is one
        // the regex actually keeps.
        ' If it really is one way, write "one-way" or "driving back" in the notes and this stops asking.'
    });
  }

  // A multi-day stay with no hotel on it. A question, not a flag — see the note
  // at the top: staying with friends or family is a normal answer.
  if (range && range.days >= 2 && hotels.length === 0 && !mentionsLodging(text)) {
    gaps.push({
      id: "no-hotel",
      severity: "info",
      title: `No hotel on a ${range.days}-day trip.`,
      detail: `This trip spans ${range.days} days${
        range.inferred ? " (read from the booking details)" : ""
      }. If they need somewhere to stay, add a Hotel; if they are staying with friends or family, nothing needs adding.`
    });
  }

  // They land, and then what? Only asked when they are actually flying in, and
  // asked rather than flagged — somebody picking them up is a normal answer.
  if (flights.length > 0 && ground.length === 0 && !mentionsGround(text)) {
    gaps.push({
      id: "no-ground",
      severity: "info",
      title: "No rental car or ground transport.",
      detail:
        "If they need to get around once they land, add a Rental car or Ground transport; if somebody is picking them up or they will not need a car, nothing needs adding."
    });
  }

  // Dates. This is the one that bites in practice — see schedule.ts. An item
  // whose date we could only infer from its text still shows on the calendar,
  // so this only fires for items with no readable date at all. A blank row is
  // left out: the blank-items gap above already asks about it, and saying
  // "no date" about a row with nothing on it is the same point twice.
  const undated = trip.items.filter((i) => itemHasNoDate(i) && !isBlankItem(i));
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
