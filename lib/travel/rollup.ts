/**
 * "What is outstanding across ALL trips, and who is waiting on what."
 *
 * The per-trip checklist has existed since Jul 31, but only inside the trip it
 * belongs to — so answering "is anything about to be missed?" meant opening
 * every trip one at a time. That is the shape of question the New hires page
 * already answers with a worklist, and travel had no equivalent.
 *
 * PURE module (no Prisma) — it takes trips and their stored state and returns
 * what is left. The loader lives in lib/data/travel.ts.
 */

import type { TravelTripView } from "@/lib/data/travel";
import {
  checklistFor,
  checklistProgress,
  derivedState,
  tripNeedsReimbursement,
  REIMBURSEMENT_STAGES,
  EMPTY_STATE,
  type AllChecklistState,
  type ChecklistProgress,
  type TripChecklistState
} from "./checklist";

export type OutstandingItem = {
  key: string;
  label: string;
  /** Why it is not done, when the trip itself can say. */
  note?: string;
  /** Nobody here can finish it — it is waiting on somebody else. */
  waitingOn?: string;
};

/** When a trip effectively starts. Same precedence the travel hub's own rows
    use (requested arrival, then the orientation date, then indoc), so the two
    views cannot disagree about which trip is next. */
export function tripStart(trip: TravelTripView): string | null {
  return trip.requestedArrival ?? trip.orientationDate ?? trip.indocStart ?? null;
}

export type TripChecklistSummary = {
  tripId: string;
  travelerName: string;
  travelerHref: string;
  purpose: string;
  status: string;
  destination: string | null;
  /** ISO datetime or null — trips without dates sort last. */
  startsAt: string | null;
  progress: ChecklistProgress;
  outstanding: OutstandingItem[];
  /** Items nobody here can finish, listed separately so they never read as neglect. */
  waiting: OutstandingItem[];
  /** Where reimbursement has got to, when this trip needs one. */
  reimbursement: { stage: string; label: string } | null;
};

export type TravelChecklistRollup = {
  trips: TripChecklistSummary[];
  totals: { trips: number; complete: number; outstanding: number; waiting: number };
};

/** Everything still to do on one trip, in checklist order. */
export function outstandingFor(trip: TravelTripView, state: TripChecklistState): { outstanding: OutstandingItem[]; waiting: OutstandingItem[] } {
  const outstanding: OutstandingItem[] = [];
  const waiting: OutstandingItem[] = [];

  for (const section of checklistFor(trip)) {
    for (const item of section.items) {
      if (item.waitingOn) {
        waiting.push({ key: item.key, label: item.label, waitingOn: item.waitingOn });
        continue;
      }
      if (item.derived) {
        // A derived item explains ITSELF from the trip ("2 things still flagged
        // above"), which is far more use in a roll-up than the generic label.
        const d = derivedState(trip, item.key);
        if (!d?.done) outstanding.push({ key: item.key, label: item.label, ...(d?.note ? { note: d.note } : {}) });
        continue;
      }
      if (!state.ticks[item.key]?.done) outstanding.push({ key: item.key, label: item.label });
    }
  }

  if (tripNeedsReimbursement(trip) && state.reimbursement !== "TRAVELER_CONFIRMED") {
    const stage = REIMBURSEMENT_STAGES.find((s) => s.value === state.reimbursement);
    outstanding.push({ key: "reimbursement", label: "Reimbursement", note: stage ? `Currently: ${stage.label}` : undefined });
  }

  return { outstanding, waiting };
}

/**
 * Roll every trip up into one list, soonest first.
 *
 * COMPLETED TRIPS ARE KEPT, not filtered out — the after-the-trip half of the
 * checklist (the day-after check-in, reimbursement) only becomes due once a trip
 * is over, so dropping finished trips would hide exactly the work that is most
 * likely to be forgotten.
 */
export function buildTravelChecklistRollup(
  trips: { trip: TravelTripView; travelerName: string; travelerHref: string }[],
  all: AllChecklistState
): TravelChecklistRollup {
  const summaries: TripChecklistSummary[] = trips.map(({ trip, travelerName, travelerHref }) => {
    const state = all[trip.id] ?? EMPTY_STATE;
    const { outstanding, waiting } = outstandingFor(trip, state);
    const stage = REIMBURSEMENT_STAGES.find((s) => s.value === state.reimbursement);
    return {
      tripId: trip.id,
      travelerName,
      travelerHref,
      purpose: trip.purpose,
      status: trip.status,
      destination: [trip.originAirport, trip.destinationAirport].filter(Boolean).join(" → ") || null,
      startsAt: tripStart(trip),
      progress: checklistProgress(trip, state),
      outstanding,
      waiting,
      reimbursement: tripNeedsReimbursement(trip) && stage ? { stage: state.reimbursement, label: stage.label } : null
    };
  });

  // Soonest trip first; undated trips last. A trip you are about to send
  // somebody on is more urgent than one three weeks out, and an undated one
  // cannot be urgent because nothing is booked.
  summaries.sort((a, b) => {
    if (Boolean(a.startsAt) !== Boolean(b.startsAt)) return a.startsAt ? -1 : 1;
    return (a.startsAt ?? "").localeCompare(b.startsAt ?? "") || a.travelerName.localeCompare(b.travelerName);
  });

  return {
    trips: summaries,
    totals: {
      trips: summaries.length,
      complete: summaries.filter((s) => s.outstanding.length === 0).length,
      outstanding: summaries.reduce((n, s) => n + s.outstanding.length, 0),
      waiting: summaries.reduce((n, s) => n + s.waiting.length, 0)
    }
  };
}
