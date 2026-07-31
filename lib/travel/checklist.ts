// The travel checklist — what still has to happen on a trip, and who still has
// to be told.
//
// Deliberately SMALL. An earlier draft ran to 28 items across five phases, which
// is heavier than the thing it tracks (there are 5 trips in the system today) and
// a checklist nobody finishes is worse than none. Three layers instead:
//
//   before  — the four things every trip needs, whatever it is for
//   purpose — the communication, which is the part that actually differs
//   after   — the return check-in and the reimbursement chain, every trip again
//
// Two shapes are deliberately NOT checkboxes:
//   - "Everything booked" is DERIVED from lib/travel/gaps.ts rather than ticked,
//     so it cannot claim a trip is booked while the gap list says otherwise.
//   - Reimbursement is ONE item that advances through stages, not four boxes
//     saying one thing. Four rows for a linear chain is most of what made the
//     first draft feel like paperwork.
//
// THIS FILE MUST STAY FREE OF PRISMA. The checklist UI is a client component and
// imports the definitions below; pulling in @/lib/prisma here dragged the pg
// driver into the browser bundle and took the whole /travel route down with
// "Module not found: Can't resolve 'fs'". Reading and writing lives in
// checklist-store.ts, which is server-only.

import { findTravelGaps } from "@/lib/travel/gaps";
import type { TravelTripView } from "@/lib/data/travel";

// --- the reimbursement chain ------------------------------------------------
//
// NOT the same thing as TravelItem.reimbursement in constants.ts. That one is
// per ITEM and answers "do we owe them for this hotel". This is per TRIP and
// tracks the conversation: accounting, then the traveller, then accounting
// again, then the traveller again. Both exist because the money and the
// follow-up are genuinely different questions.

export const REIMBURSEMENT_STAGES = [
  { value: "NOT_STARTED", label: "Not started" },
  { value: "SUBMITTED", label: "Sent to accounting" },
  { value: "TRAVELER_TOLD", label: "Traveler told it is submitted" },
  { value: "PAYMENT_CONFIRMED", label: "Accounting confirmed payment" },
  { value: "TRAVELER_CONFIRMED", label: "Traveler confirmed they got it" }
] as const;

export type ReimbursementStage = (typeof REIMBURSEMENT_STAGES)[number]["value"];

export function isReimbursementStage(v: unknown): v is ReimbursementStage {
  return typeof v === "string" && REIMBURSEMENT_STAGES.some((s) => s.value === v);
}

/**
 * Does this trip owe anybody money?
 *
 * Read from the items rather than asked: an item the traveller booked
 * themselves, or one already marked as owed, is the whole trigger. A trip with
 * nothing self-booked never shows the chain at all.
 */
export function tripNeedsReimbursement(trip: TravelTripView): boolean {
  return trip.items.some((i) => i.selfBooked || i.reimbursement === "NEEDED");
}

// --- the recruiting-visit pack ----------------------------------------------
//
// These are ANSWERS, not ticks. "Who will they meet" has no meaningful done
// state — it has content or it doesn't — and a checkbox would let somebody mark
// it complete while the answer is still nowhere. Filling these in is what the
// supervisor conversation produces, and what the calendar blocks come from.

export const VISIT_FIELDS = [
  { key: "whoTheyMeet", label: "Who they will meet while here" },
  { key: "locations", label: "Which locations they will visit" },
  { key: "blocks", label: "Meals, meetings or events that need a calendar block" },
  { key: "extraPeople", label: "Anyone extra we want them to meet, beyond their future team" },
  { key: "gift", label: "Welcome gift" },
  { key: "guest", label: "Guest coming, and anything planned for them" }
] as const;

export type VisitFieldKey = (typeof VISIT_FIELDS)[number]["key"];

export function isVisitField(v: unknown): v is VisitFieldKey {
  return typeof v === "string" && VISIT_FIELDS.some((f) => f.key === v);
}

// --- item definitions -------------------------------------------------------

export type ChecklistItem = {
  key: string;
  label: string;
  detail?: string;
  /**
   * Derived from the trip, not ticked by a human. A derived item is read-only:
   * the way to change it is to change the trip.
   */
  derived?: boolean;
  /**
   * Built, but we do not yet know what it should say. Rendered visibly and
   * disabled with this text, rather than left out — an invisible gap reads as
   * "nothing needed here", which is exactly the wrong impression.
   */
  waitingOn?: string;
};

export type ChecklistSection = {
  id: "before" | "purpose" | "after";
  title: string;
  items: ChecklistItem[];
};

const BEFORE: ChecklistItem[] = [
  {
    key: "dates-confirmed",
    label: "Trip is needed, and the dates line up with the event",
    detail: "Arriving before it starts and leaving after it ends — not just that dates exist."
  },
  {
    key: "supervisor-plan",
    label: "Asked the supervisor what they want scheduled",
    detail:
      "Lunch, dinner, an in-person meeting, or anything else worth blocking time for while the traveler is in town. Their answers are what fill in the visit plan and the calendar."
  },
  {
    key: "booked",
    label: "Everything is booked",
    detail: "Derived from the trip itself — this ticks when nothing is flagged as still needing booking.",
    derived: true
  },
  {
    key: "itinerary-sent",
    label: "Itinerary sent to the traveler",
    detail: "Flights, hotel, ground transport and the details below, in whatever they will actually read."
  }
];

const AFTER: ChecklistItem[] = [
  {
    key: "day-after",
    label: "Day-after check-in with the traveler",
    detail:
      "One conversation, four things: did they get home safely, do they have any questions, we need every receipt in case a number changed, and did they pay for anything themselves that we owe them back."
  }
];

/**
 * The purpose-specific middle — the part that genuinely differs.
 *
 * ORIENTATION points at the orientation invite rather than restating it: that
 * email already carries the where, when, dress code and meals, and saying it
 * twice in two voices is how the two drift apart.
 */
function purposeItems(purpose: string): ChecklistItem[] {
  switch (purpose) {
    case "ORIENTATION":
      return [
        {
          key: "orientation-details",
          label: "Traveler has the orientation details",
          detail:
            "Where to be and when, who to contact, the door code, dress code, meals provided and what to expect. Most of this is already in the orientation invitation email — send that rather than writing it again, and only add what the trip changes."
        }
      ];
    case "INDOC":
      return [
        {
          key: "indoc-details",
          label: "Traveler has the indoc details",
          waitingOn:
            "Waiting on the CPO's indoc content — what to bring, times and places, and what is expected of them. Nothing is written here yet."
        }
      ];
    case "TRAINING":
      return [
        {
          key: "training-details",
          label: "Traveler has the training details",
          waitingOn: "Waiting on Hannah and the CPO to confirm what a training traveler actually gets told."
        }
      ];
    case "RECRUITING_VISIT":
      return [
        {
          key: "visit-plan",
          label: "Visit plan agreed and scheduled",
          detail: "The answers below are filled in and anything needing a time is on the calendar."
        }
      ];
    default:
      return [];
  }
}

/** The whole checklist for one trip, in order. */
export function checklistFor(trip: TravelTripView): ChecklistSection[] {
  const sections: ChecklistSection[] = [{ id: "before", title: "Before the trip", items: BEFORE }];

  const mid = purposeItems(trip.purpose);
  if (mid.length) sections.push({ id: "purpose", title: "What this traveler needs to be told", items: mid });

  sections.push({ id: "after", title: "After the trip", items: AFTER });
  return sections;
}

/**
 * Derived items, resolved against the trip. Kept separate from the definitions
 * so the definitions stay data and this stays the only place that reads a trip.
 */
export function derivedState(trip: TravelTripView, key: string): { done: boolean; note: string } | null {
  if (key !== "booked") return null;
  if (trip.items.length === 0) {
    return { done: false, note: "Nothing is booked on this trip yet." };
  }
  const open = findTravelGaps(trip).filter((g) => g.severity === "action");
  if (open.length) {
    return { done: false, note: `${open.length} thing${open.length === 1 ? "" : "s"} still flagged above.` };
  }
  return { done: true, note: "Nothing is flagged as missing." };
}

// --- stored state -----------------------------------------------------------

export type ChecklistTick = { done: boolean; at: string; by: string | null };

export type TripChecklistState = {
  ticks: Record<string, ChecklistTick>;
  visit: Partial<Record<VisitFieldKey, string>>;
  reimbursement: ReimbursementStage;
};

export const EMPTY_STATE: TripChecklistState = { ticks: {}, visit: {}, reimbursement: "NOT_STARTED" };

export type AllChecklistState = Record<string, TripChecklistState>;

/** Shape-check one trip's stored blob. Pure, so the store and the UI agree. */
export function coerceChecklistState(raw: unknown): TripChecklistState {
  const o = (raw ?? {}) as Partial<TripChecklistState>;
  return {
    ticks: o.ticks && typeof o.ticks === "object" ? o.ticks : {},
    visit: o.visit && typeof o.visit === "object" ? o.visit : {},
    reimbursement: isReimbursementStage(o.reimbursement) ? o.reimbursement : "NOT_STARTED"
  };
}

// --- roll-up ----------------------------------------------------------------

export type ChecklistProgress = {
  done: number;
  total: number;
  /** Items that are waiting on somebody else and cannot be finished yet. */
  blocked: number;
};

/**
 * How far along a trip is. Derived items count, waiting-on items do NOT — they
 * are not the user's to finish, and counting them would leave every indoc trip
 * permanently short of complete through no fault of the person doing the work.
 */
export function checklistProgress(trip: TravelTripView, state: TripChecklistState): ChecklistProgress {
  let done = 0;
  let total = 0;
  let blocked = 0;

  for (const section of checklistFor(trip)) {
    for (const item of section.items) {
      if (item.waitingOn) {
        blocked += 1;
        continue;
      }
      total += 1;
      if (item.derived) {
        if (derivedState(trip, item.key)?.done) done += 1;
      } else if (state.ticks[item.key]?.done) {
        done += 1;
      }
    }
  }

  if (tripNeedsReimbursement(trip)) {
    total += 1;
    if (state.reimbursement === "TRAVELER_CONFIRMED") done += 1;
  }

  return { done, total, blocked };
}
