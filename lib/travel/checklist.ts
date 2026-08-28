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
          detail:
            "From the Chief Pilot's Office welcome: INDOC is in Ogden at 3715 Airport Rd, Ogden, UT 84405, on site and ready at 0800 on the first day — confirm this session's dates, and send the calendar invite. Arrival: west side main entrance, up the stairs straight ahead, classroom behind the half walls. All assigned online training must be COMPLETED BEFORE they arrive, with their completion times written down. A notebook and pen are provided; their own are welcome. Lunch is provided each day. Phones away during class. Booking airlines and hotels is covered during INDOC itself. Contacts to give them: cpo@skyshare.com for anything Chief Pilot's Office including days off, crewinfo@skyshare.com for all hotel and airline communication, skyops@skyshare.com or 801 516 9189 for flight scheduling, and the on-duty manager on 435 220 4924 for flight-related admin only."
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

/**
 * Three states, not a checkbox.
 *
 * A tick could only ever say "done" or "not done yet", so an item that simply
 * does not apply to a trip — a local traveler who needs no itinerary, a visit
 * with nobody to brief — sat unticked forever and made a fully-handled trip
 * read as incomplete. N/A is a DECISION somebody made, and it is recorded with
 * the same who-and-when as a completion.
 *
 * The vocabulary is deliberately identical to OnboardingTask.status
 * (TODO | DONE | NA, prisma/schema.prisma). Travel and onboarding checklists
 * sit on the same profiles, and two different words for the same three states
 * is how people stop trusting either one.
 */
export const CHECKLIST_STATUSES = [
  { value: "TODO", label: "To do" },
  { value: "DONE", label: "Done" },
  { value: "NA", label: "N/A" }
] as const;

export type ChecklistStatus = (typeof CHECKLIST_STATUSES)[number]["value"];

export function isChecklistStatus(v: unknown): v is ChecklistStatus {
  return typeof v === "string" && CHECKLIST_STATUSES.some((s) => s.value === v);
}

export function checklistStatusLabel(v: string | null | undefined): string {
  return CHECKLIST_STATUSES.find((s) => s.value === v)?.label ?? "To do";
}

export type ChecklistTick = { status: ChecklistStatus; at: string; by: string | null };

/**
 * Groups of request-detail fields that a given trip may simply not have.
 *
 * WHY THIS EXISTS. Not everyone we fly in is a pilot. A support-role hire has an
 * orientation and a start date and no indoc and no training at all, so the indoc
 * boxes on their trip are dead space somebody has to scroll past every time.
 *
 * IT IS A MARK, NOT A RULE. This is deliberately not derived from the trip's
 * purpose, and the live data says why: an ORIENTATION trip is very often the
 * same visit as the indoc that follows it — the Aug 31 trip runs six days and
 * covers both — so a rule keyed on purpose would hide the indoc dates on
 * exactly the trips that need them. Somebody who knows the person marks it.
 *
 * NOTHING IS DELETED. Marking a group not needed collapses it; the values, if
 * any, are still on the trip and come straight back when it is restored.
 */
export const NOT_NEEDED_GROUPS = [
  { key: "orientation", label: "Orientation date", fields: ["orientationDate"] },
  { key: "indoc", label: "Indoc dates", fields: ["indocStart", "indocEnd"] },
  { key: "preferences", label: "Airline, hotel and transport preferences", fields: ["preferredAirline", "preferences", "additionalTransport"] }
] as const;

export type NotNeededGroupKey = (typeof NOT_NEEDED_GROUPS)[number]["key"];

export function isNotNeededGroup(v: unknown): v is NotNeededGroupKey {
  return typeof v === "string" && NOT_NEEDED_GROUPS.some((g) => g.key === v);
}

export type TripChecklistState = {
  ticks: Record<string, ChecklistTick>;
  visit: Partial<Record<VisitFieldKey, string>>;
  reimbursement: ReimbursementStage;
  /** Request-detail groups this trip does not have. Absent means shown. */
  notNeeded: Partial<Record<NotNeededGroupKey, boolean>>;
};

export const EMPTY_STATE: TripChecklistState = {
  ticks: {},
  visit: {},
  reimbursement: "NOT_STARTED",
  notNeeded: {}
};

export type AllChecklistState = Record<string, TripChecklistState>;

/**
 * Read one stored tick, accepting the pre-tri-state shape.
 *
 * Ticks used to be { done: boolean }. The live blob is NOT migrated: it is one
 * shared WorkspaceSetting row holding every trip's state, both dev and prod
 * point at the same database, and rewriting it to change a field name is the
 * most expensive kind of change to get wrong for the least benefit. So the old
 * shape is read in place — done:true becomes DONE, anything else TODO — and a
 * row is only ever rewritten when somebody next touches that item.
 *
 * Each tick is validated individually rather than trusting the object wholesale.
 * A malformed `at` used to reach new Date(tick.at) in the UI and render the
 * literal words "Invalid Date" next to somebody's name.
 */
function coerceTick(raw: unknown): ChecklistTick | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { status?: unknown; done?: unknown; at?: unknown; by?: unknown };

  const status: ChecklistStatus = isChecklistStatus(o.status)
    ? o.status
    : o.done === true
      ? "DONE"
      : "TODO";

  const at = typeof o.at === "string" && !Number.isNaN(new Date(o.at).getTime()) ? o.at : "";
  return { status, at, by: typeof o.by === "string" ? o.by : null };
}

/** Shape-check one trip's stored blob. Pure, so the store and the UI agree. */
export function coerceChecklistState(raw: unknown): TripChecklistState {
  const o = (raw ?? {}) as Partial<TripChecklistState>;

  const ticks: Record<string, ChecklistTick> = {};
  if (o.ticks && typeof o.ticks === "object") {
    for (const [key, value] of Object.entries(o.ticks as Record<string, unknown>)) {
      const tick = coerceTick(value);
      if (tick) ticks[key] = tick;
    }
  }

  // Only known group keys survive, and only as real booleans. Every row written
  // before this field existed simply has none, which reads as "show everything".
  const notNeeded: Partial<Record<NotNeededGroupKey, boolean>> = {};
  if (o.notNeeded && typeof o.notNeeded === "object") {
    for (const [key, value] of Object.entries(o.notNeeded as Record<string, unknown>)) {
      if (isNotNeededGroup(key) && value === true) notNeeded[key] = true;
    }
  }

  return {
    ticks,
    visit: o.visit && typeof o.visit === "object" ? o.visit : {},
    reimbursement: isReimbursementStage(o.reimbursement) ? o.reimbursement : "NOT_STARTED",
    notNeeded
  };
}

/** What state an item is in, with TODO as the default for anything untouched. */
export function statusOf(state: TripChecklistState, key: string): ChecklistStatus {
  return state.ticks[key]?.status ?? "TODO";
}

// --- roll-up ----------------------------------------------------------------

export type ChecklistProgress = {
  done: number;
  total: number;
  /** Items that are waiting on somebody else and cannot be finished yet. */
  blocked: number;
  /** Items marked as not applying to this trip. */
  na: number;
};

/**
 * How far along a trip is.
 *
 * Derived items count. Waiting-on items do NOT — they are not the user's to
 * finish, and counting them would leave every indoc trip permanently short of
 * complete through no fault of the person doing the work.
 *
 * N/A items leave the DENOMINATOR rather than counting as done. Marking
 * something not applicable is a statement that it was never part of this trip,
 * so a trip with two N/A items reads "4 of 4", not "6 of 6" — the second would
 * quietly inflate how much work a trip took.
 */
export function checklistProgress(trip: TravelTripView, state: TripChecklistState): ChecklistProgress {
  let done = 0;
  let total = 0;
  let blocked = 0;
  let na = 0;

  for (const section of checklistFor(trip)) {
    for (const item of section.items) {
      if (item.waitingOn) {
        blocked += 1;
        continue;
      }
      // Derived items are read from the trip, so they have no N/A state — the
      // way to change one is to change the trip.
      if (item.derived) {
        total += 1;
        if (derivedState(trip, item.key)?.done) done += 1;
        continue;
      }

      const status = statusOf(state, item.key);
      if (status === "NA") {
        na += 1;
        continue;
      }
      total += 1;
      if (status === "DONE") done += 1;
    }
  }

  if (tripNeedsReimbursement(trip)) {
    total += 1;
    if (state.reimbursement === "TRAVELER_CONFIRMED") done += 1;
  }

  return { done, total, blocked, na };
}
