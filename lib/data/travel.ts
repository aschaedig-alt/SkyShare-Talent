import { prisma } from "@/lib/prisma";
// Value import, but not a cycle: schedule.ts only imports TYPES from this file,
// and those are erased at build time.
import {
  buildTravelCalendar,
  type TravelAwaySpan,
  type TravelCalendarEvent
} from "@/lib/travel/schedule";
import { getAllChecklists } from "@/lib/travel/checklist-store";
import { buildTravelChecklistRollup, type TravelChecklistRollup } from "@/lib/travel/rollup";
import {
  applicationOutcome,
  bucketOf,
  dispositionGroup,
  isHistoricalRecord,
  type CandidateBucket
} from "@/lib/candidates/buckets";
import { dayKeyOf } from "@/lib/dates/display";

// ---- View types (serializable; dates as ISO strings) ------------------------

export type TravelItemView = {
  id: string;
  type: string;
  vendor: string | null;
  confirmation: string | null;
  detail: string | null;
  startsAt: string | null;
  endsAt: string | null;
  amount: number | null;
  currency: string;
  /** The traveller booked this themselves rather than us booking it. */
  selfBooked: boolean;
  /** NOT_NEEDED | NEEDED | REIMBURSED — only meaningful when selfBooked. */
  reimbursement: string;
};

export type TravelReceiptView = {
  id: string;
  displayFilename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  amount: number | null;
  uploadedAt: string;
};

export type TravelTripView = {
  id: string;
  newHireId: string | null;
  candidateId: string | null;
  purpose: string;
  status: string;
  originAirport: string | null;
  destinationAirport: string | null;
  orientationDate: string | null;
  indocStart: string | null;
  indocEnd: string | null;
  requestedArrival: string | null;
  requestedReturn: string | null;
  preferredAirline: string | null;
  frequentFlyer: string | null;
  hotelLoyalty: string | null;
  rentalLoyalty: string | null;
  preferences: string | null;
  additionalTransport: string | null;
  specialRequests: string | null;
  /** Names of anyone travelling with the traveller. */
  guests: string[];
  notes: string | null;
  bookedBy: string | null;
  createdAt: string;
  updatedAt: string;
  items: TravelItemView[];
  receipts: TravelReceiptView[];
  /** Sum of item amounts. */
  total: number;
  /** Sum of self-booked items still owed back to the traveller. */
  reimbursementOwed: number;
};

type TripWithRelations = {
  id: string;
  newHireId: string | null;
  candidateId: string | null;
  purpose: string;
  status: string;
  originAirport: string | null;
  destinationAirport: string | null;
  orientationDate: Date | null;
  indocStart: Date | null;
  indocEnd: Date | null;
  requestedArrival: Date | null;
  requestedReturn: Date | null;
  preferredAirline: string | null;
  frequentFlyer: string | null;
  hotelLoyalty: string | null;
  rentalLoyalty: string | null;
  preferences: string | null;
  additionalTransport: string | null;
  specialRequests: string | null;
  guests: string[];
  notes: string | null;
  bookedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: {
    id: string;
    type: string;
    vendor: string | null;
    confirmation: string | null;
    detail: string | null;
    startsAt: Date | null;
    endsAt: Date | null;
    amount: number | null;
    currency: string;
    selfBooked: boolean;
    reimbursement: string;
  }[];
  receipts: {
    id: string;
    displayFilename: string;
    mimeType: string | null;
    sizeBytes: number | null;
    amount: number | null;
    uploadedAt: Date;
  }[];
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

const tripInclude = {
  items: { orderBy: { startsAt: "asc" } },
  receipts: { orderBy: { uploadedAt: "desc" } }
} as const;

export function toTravelTripView(t: TripWithRelations): TravelTripView {
  return {
    id: t.id,
    newHireId: t.newHireId,
    candidateId: t.candidateId,
    purpose: t.purpose,
    status: t.status,
    originAirport: t.originAirport,
    destinationAirport: t.destinationAirport,
    orientationDate: iso(t.orientationDate),
    indocStart: iso(t.indocStart),
    indocEnd: iso(t.indocEnd),
    requestedArrival: iso(t.requestedArrival),
    requestedReturn: iso(t.requestedReturn),
    preferredAirline: t.preferredAirline,
    frequentFlyer: t.frequentFlyer,
    hotelLoyalty: t.hotelLoyalty,
    rentalLoyalty: t.rentalLoyalty,
    preferences: t.preferences,
    additionalTransport: t.additionalTransport,
    specialRequests: t.specialRequests,
    guests: t.guests ?? [],
    notes: t.notes,
    bookedBy: t.bookedBy,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    items: t.items.map((i) => ({
      id: i.id,
      type: i.type,
      vendor: i.vendor,
      confirmation: i.confirmation,
      detail: i.detail,
      startsAt: iso(i.startsAt),
      endsAt: iso(i.endsAt),
      amount: i.amount,
      currency: i.currency,
      selfBooked: i.selfBooked,
      reimbursement: i.reimbursement
    })),
    receipts: t.receipts.map((r) => ({
      id: r.id,
      displayFilename: r.displayFilename,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      amount: r.amount,
      uploadedAt: r.uploadedAt.toISOString()
    })),
    total: t.items.reduce((sum, i) => sum + (i.amount ?? 0), 0),
    // What the traveller paid out of pocket and we still owe back.
    reimbursementOwed: t.items.reduce(
      (sum, i) => sum + (i.selfBooked && i.reimbursement === "NEEDED" ? (i.amount ?? 0) : 0),
      0
    )
  };
}

export async function getTravelTripsForNewHire(newHireId: string): Promise<TravelTripView[]> {
  const trips = await prisma.travelTrip.findMany({
    where: { newHireId },
    include: tripInclude,
    orderBy: { createdAt: "desc" }
  });
  return (trips as TripWithRelations[]).map(toTravelTripView);
}

export async function getTravelTripsForCandidate(candidateId: string): Promise<TravelTripView[]> {
  const trips = await prisma.travelTrip.findMany({
    where: { candidateId },
    include: tripInclude,
    orderBy: { createdAt: "desc" }
  });
  return (trips as TripWithRelations[]).map(toTravelTripView);
}

// ---- Traveler loyalty (stored on the person, auto-pulled into new trips) ----

export type TravelerLoyalty = {
  frequentFlyer: string | null;
  hotelLoyalty: string | null;
  rentalLoyalty: string | null;
};

const EMPTY_LOYALTY: TravelerLoyalty = { frequentFlyer: null, hotelLoyalty: null, rentalLoyalty: null };

export async function getNewHireLoyalty(newHireId: string): Promise<TravelerLoyalty> {
  const hire = await prisma.newHire.findUnique({
    where: { id: newHireId },
    select: { frequentFlyer: true, hotelLoyalty: true, rentalLoyalty: true }
  });
  return hire ?? EMPTY_LOYALTY;
}

export async function getCandidateLoyalty(candidateId: string): Promise<TravelerLoyalty> {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { frequentFlyer: true, hotelLoyalty: true, rentalLoyalty: true }
  });
  return candidate ?? EMPTY_LOYALTY;
}


export async function getTravelTripView(tripId: string): Promise<TravelTripView | null> {
  const trip = await prisma.travelTrip.findUnique({ where: { id: tripId }, include: tripInclude });
  return trip ? toTravelTripView(trip as TripWithRelations) : null;
}

// ---- Travel hub (all trips across hires + candidates) -----------------------

export type TravelHubRow = {
  tripId: string;
  /** NewHire.id or Candidate.id — lets the hub open them inline. */
  travelerId: string;
  travelerName: string;
  travelerType: "newHire" | "candidate";
  travelerHref: string;
  purpose: string;
  status: string;
  destination: string | null;
  startsAt: string | null;
  itemCount: number;
  receiptCount: number;
  total: number;
  updatedAt: string;
};

export type TravelTravelerOption = {
  id: string;
  name: string;
  type: "newHire" | "candidate";
  href: string;
  subtitle: string | null;
};

export type TravelHubData = {
  rows: TravelHubRow[];
  stats: { tripCount: number; needsBooking: number; booked: number; totalSpend: number };
  travelers: TravelTravelerOption[];
};

// ---- Hub calendar ----------------------------------------------------------

/** One traveller and the trips the grid will draw for them. */
export type TravelCalendarTraveler = {
  /** Stable identity for colour assignment: type + id, since a NewHire and a
      Candidate could in principle share an id space. */
  key: string;
  travelerId: string;
  name: string;
  type: "newHire" | "candidate";
  href: string;
  /**
   * The trips themselves rather than pre-flattened events.
   *
   * The grid needs the route text and per-item times to work out which end of a
   * flight touches home, and the rail needs the hotel and the rental car — none
   * of which survives being reduced to day-keyed events first.
   */
  trips: TravelTripView[];
  /** Kept for the away-day shading and any caller that just wants the dates. */
  events: TravelCalendarEvent[];
  spans: TravelAwaySpan[];
};

export type TravelCalendarData = {
  travelers: TravelCalendarTraveler[];
  /** Travellers whose trips carry no readable date anywhere — they cannot be
      drawn, and silently omitting them is how a missing trip goes unnoticed. */
  undated: { name: string; href: string; tripCount: number }[];
};

/**
 * Everything the hub calendar needs.
 *
 * Separate from getTravelOverview because the hub rows deliberately carry no
 * item detail, and a calendar needs the items themselves — most real TravelItem
 * rows have startsAt = null with the date sitting in the confirmation text, so
 * buildTravelCalendar has to read `detail` to place anything at all.
 *
 * Loads every non-canceled trip. Fine at the current scale (5 trips); if travel
 * grows this should take a date window, since the calendar only ever draws one
 * month.
 */
export async function getTravelCalendarData(): Promise<TravelCalendarData> {
  const trips = await prisma.travelTrip.findMany({
    where: { status: { not: "CANCELED" } },
    include: {
      ...tripInclude,
      newHire: { select: { id: true, name: true } },
      candidate: { select: { id: true, displayName: true } }
    }
  });

  const byTraveler = new Map<string, { name: string; type: "newHire" | "candidate"; id: string; href: string; trips: TravelTripView[] }>();

  for (const raw of trips) {
    const trip = toTravelTripView(raw as TripWithRelations);
    const t = raw as TripWithRelations & {
      newHire?: { id: string; name: string } | null;
      candidate?: { id: string; displayName: string } | null;
    };
    const isHire = Boolean(t.newHire);
    const id = (isHire ? t.newHire?.id : t.candidate?.id) ?? "";
    if (!id) continue;
    const key = `${isHire ? "newHire" : "candidate"}:${id}`;
    const existing = byTraveler.get(key);
    if (existing) {
      existing.trips.push(trip);
    } else {
      byTraveler.set(key, {
        id,
        name: t.newHire?.name ?? t.candidate?.displayName ?? "Unknown",
        type: isHire ? "newHire" : "candidate",
        href: isHire ? `/people/${id}` : `/candidates/${id}`,
        trips: [trip]
      });
    }
  }

  const travelers: TravelCalendarTraveler[] = [];
  const undated: TravelCalendarData["undated"] = [];

  for (const [key, v] of byTraveler) {
    const { events, spans } = buildTravelCalendar(v.trips);
    if (events.length === 0 && spans.length === 0) {
      undated.push({ name: v.name, href: v.href, tripCount: v.trips.length });
      continue;
    }
    travelers.push({ key, travelerId: v.id, name: v.name, type: v.type, href: v.href, trips: v.trips, events, spans });
  }

  travelers.sort((a, b) => a.name.localeCompare(b.name));
  undated.sort((a, b) => a.name.localeCompare(b.name));
  return { travelers, undated };
}

export async function getTravelOverview(): Promise<TravelHubData> {
  const trips = await prisma.travelTrip.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      purpose: true,
      status: true,
      originAirport: true,
      destinationAirport: true,
      requestedArrival: true,
      orientationDate: true,
      indocStart: true,
      updatedAt: true,
      newHire: { select: { id: true, name: true } },
      candidate: { select: { id: true, displayName: true } },
      items: { select: { amount: true } },
      _count: { select: { receipts: true } }
    }
  });

  const rows: TravelHubRow[] = trips.map((t) => {
    const isHire = Boolean(t.newHire);
    const route = [t.originAirport, t.destinationAirport].filter(Boolean).join(" → ") || null;
    const startDate = t.requestedArrival ?? t.orientationDate ?? t.indocStart ?? null;
    return {
      tripId: t.id,
      travelerId: (isHire ? t.newHire?.id : t.candidate?.id) ?? "",
      travelerName: t.newHire?.name ?? t.candidate?.displayName ?? "Unknown",
      travelerType: isHire ? "newHire" : "candidate",
      travelerHref: isHire ? `/people/${t.newHire!.id}` : `/candidates/${t.candidate?.id ?? ""}`,
      purpose: t.purpose,
      status: t.status,
      destination: route,
      startsAt: startDate ? startDate.toISOString() : null,
      itemCount: t.items.length,
      receiptCount: t._count.receipts,
      total: t.items.reduce((sum, i) => sum + (i.amount ?? 0), 0),
      updatedAt: t.updatedAt.toISOString()
    };
  });

  const active = rows.filter((r) => r.status !== "CANCELED");

  // Who a new trip can be created for: current hires + active candidates.
  const [hires, candidates] = await Promise.all([
    prisma.newHire.findMany({
      where: { stage: { not: "ARCHIVED" } },
      select: { id: true, name: true, position: true },
      orderBy: { name: "asc" }
    }),
    prisma.candidate.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, displayName: true, currentTitle: true },
      orderBy: { displayName: "asc" }
    })
  ]);
  const travelers: TravelTravelerOption[] = [
    ...hires.map((h) => ({
      id: h.id,
      name: h.name,
      type: "newHire" as const,
      href: `/people/${h.id}`,
      subtitle: h.position
    })),
    ...candidates.map((c) => ({
      id: c.id,
      name: c.displayName,
      type: "candidate" as const,
      href: `/candidates/${c.id}`,
      subtitle: c.currentTitle
    }))
  ];

  return {
    rows,
    stats: {
      tripCount: rows.length,
      needsBooking: rows.filter((r) => r.status === "NEEDED").length,
      booked: rows.filter((r) => r.status === "BOOKED" || r.status === "COMPLETED").length,
      totalSpend: active.reduce((sum, r) => sum + r.total, 0)
    },
    travelers
  };
}

// ---- Was this traveler ultimately hired? ------------------------------------

/**
 * THE ONE DEFINITION of "hired" for travel spend. Both the Reports panel and the
 * Travel page's year chart go through this, so the two can never disagree about
 * which side of the split somebody's flights land on.
 *
 * WHY IT IS NOT JUST "NewHire.candidateId IS SET". That row is created when an
 * offer goes out, not when somebody is hired — "Move to pre-onboarding" writes
 * it. So the link on its own counts an offer that was later DECLINED as hired
 * spend, which is exactly backwards for a chart whose whole job is to show what
 * the people we did not hire cost us. Measured on live data before this changed:
 * Brandon Edwards declined his offer (CandidateApplication.offerStatus =
 * "DECLINED") and his $843.65 recruiting visit was counted as hired spend, with
 * the not-hired total reading $0.00 across the whole database.
 *
 * The authority on the outcome is the candidate pipeline's own ladder —
 * applicationOutcome / bucketOf in lib/candidates/buckets — which already ranks
 * a SIGNED offer above a stale status string and already knows what DECLINED
 * means. The hire record is only consulted where the ladder has nothing to say.
 */
export type TravelerHiredEvidence = {
  /** A NewHire row exists for this traveler. Created at OFFER time — see above. */
  linkedToHire: boolean;
  /** NewHire.canceled — the hire was called off. */
  hireCanceled: boolean;
  /** NewHire.offerSignedDate is set. */
  hireOfferSigned: boolean;
  /** NewHire.stage is POST_ONBOARD — they actually came through onboarding. */
  hireOnboarded: boolean;
  /** The candidate ladder's verdict, or null when there is no candidate record. */
  bucket: CandidateBucket | null;
};

export function travelerWasHired(ev: TravelerHiredEvidence): boolean {
  // A signed offer or a HIRED disposition wins outright, exactly as the ladder
  // has it: somebody hired for one job and rejected for three others is hired.
  if (ev.bucket === "hired") return true;
  // Nothing links this traveler to a hire, and nothing says they were hired.
  if (!ev.linkedToHire) return false;
  if (ev.hireCanceled) return false;
  // The hire record's own evidence, for a hire with no candidate record behind
  // it (a back-filled employee) or whose application row was never updated.
  if (ev.hireOfferSigned || ev.hireOnboarded) return true;
  // Otherwise the offer-time link stands until something contradicts it. The one
  // thing that does is the ladder landing on "not selected", which is where a
  // declined offer, a retracted offer and a knockout all end up. An archived
  // (historical) record says nothing about a live hire, so it does not count
  // against one.
  return ev.bucket !== "notselected";
}

/** What a trip needs to carry for the rule above to be applied to it. */
type TripTravelerLink = { id: string; newHireId: string | null; candidateId: string | null };

type TravelerVerdict = {
  /**
   * One key per PERSON, not per trip or per record. A candidate fly-out and the
   * orientation trip booked after they were hired are the same traveler, so the
   * candidate id wins whenever it can be resolved — otherwise counting distinct
   * hired travelers double-counts anybody who has both.
   */
  travelerKey: string | null;
  hired: boolean;
};

const HIRE_EVIDENCE_SELECT = {
  id: true,
  candidateId: true,
  canceled: true,
  offerSignedDate: true,
  stage: true,
  createdAt: true
} as const;

/**
 * Resolve every trip to its traveler and whether that traveler was hired.
 *
 * Read-only, and deliberately a separate pass rather than an include: NewHire
 * has no Prisma relation back to Candidate (only a bare candidateId column), so
 * the hop has to be a second query either way.
 */
async function resolveTravelerHiring(trips: TripTravelerLink[]): Promise<Map<string, TravelerVerdict>> {
  const hireIds = [...new Set(trips.map((t) => t.newHireId).filter((v): v is string => Boolean(v)))];
  const linkedCandidateIds = [...new Set(trips.map((t) => t.candidateId).filter((v): v is string => Boolean(v)))];

  const [hiresById, hiresByCandidate] = await Promise.all([
    hireIds.length
      ? prisma.newHire.findMany({ where: { id: { in: hireIds } }, select: HIRE_EVIDENCE_SELECT })
      : Promise.resolve([]),
    linkedCandidateIds.length
      ? prisma.newHire.findMany({
          where: { candidateId: { in: linkedCandidateIds } },
          select: HIRE_EVIDENCE_SELECT,
          // Newest first: a rehire has more than one NewHire row and the current
          // one is the one that describes where they stand today.
          orderBy: { createdAt: "desc" }
        })
      : Promise.resolve([])
  ]);

  const hireById = new Map(hiresById.map((h) => [h.id, h]));
  const hireByCandidate = new Map<string, (typeof hiresByCandidate)[number]>();
  for (const h of hiresByCandidate) {
    if (h.candidateId && !hireByCandidate.has(h.candidateId)) hireByCandidate.set(h.candidateId, h);
  }

  const candidateIds = [
    ...new Set([
      ...linkedCandidateIds,
      ...hiresById.map((h) => h.candidateId).filter((v): v is string => Boolean(v))
    ])
  ];
  const candidates = candidateIds.length
    ? await prisma.candidate.findMany({
        where: { id: { in: candidateIds } },
        select: {
          id: true,
          origin: true,
          archivedAt: true,
          applications: { select: { status: true, disposition: true, offerStatus: true } }
        }
      })
    : [];

  const bucketByCandidate = new Map<string, CandidateBucket>();
  for (const c of candidates) {
    const apps = c.applications.map((a) => {
      const outcome = applicationOutcome(a.status, a.disposition, a.offerStatus);
      // No disposition overrides here on purpose: they only ever move an ending
      // between "evergreen" and the other reasons, and none of those groups
      // changes the hired/not-hired verdict below.
      return { outcome, group: dispositionGroup(a.status, outcome) };
    });
    bucketByCandidate.set(c.id, bucketOf(apps, isHistoricalRecord(c.origin, c.archivedAt)));
  }

  const out = new Map<string, TravelerVerdict>();
  for (const t of trips) {
    // A hire link wins over a candidate link when a trip carries both — one live
    // trip does, despite the schema comment saying exactly one is ever set.
    const hire = t.newHireId
      ? (hireById.get(t.newHireId) ?? null)
      : t.candidateId
        ? (hireByCandidate.get(t.candidateId) ?? null)
        : null;
    const candidateId = t.candidateId ?? hire?.candidateId ?? null;
    const bucket = candidateId ? (bucketByCandidate.get(candidateId) ?? null) : null;
    out.set(t.id, {
      travelerKey: candidateId ? `cand:${candidateId}` : t.newHireId ? `hire:${t.newHireId}` : null,
      hired: travelerWasHired({
        linkedToHire: Boolean(hire),
        hireCanceled: Boolean(hire?.canceled),
        hireOfferSigned: Boolean(hire?.offerSignedDate),
        hireOnboarded: hire?.stage === "POST_ONBOARD",
        bucket
      })
    });
  }
  return out;
}

// ---- Reporting --------------------------------------------------------------

export type TravelSpendTripRow = {
  tripId: string;
  travelerName: string;
  travelerHref: string | null; // /people/[id] or /candidates/[id]
  travelerType: "newHire" | "candidate" | "unassigned";
  hired: boolean; // linked to a hire, or a candidate who was ultimately hired
  purpose: string;
  route: string | null; // origin → destination
  status: string;
  startsAt: string | null;
  total: number;
};

export type TravelSpendSummary = {
  totalSpend: number;
  tripCount: number;
  hiredSpend: number; // spend on travelers who were ultimately hired
  candidateSpend: number; // trips attached to candidate records (hired or not)
  notHiredSpend: number; // spend on travelers who were not hired
  costPerHire: number | null; // hiredSpend / distinct hired travelers
  hiredTravelers: number;
  byPurpose: { purpose: string; spend: number; trips: number }[];
  trips: TravelSpendTripRow[]; // per-trip detail for drill-down, richest first
};

/**
 * Roll up all booked travel spend for budgets.
 *
 * "Hired" is travelerWasHired() above — the same rule the Travel page's year
 * chart uses. It used to be "the trip is linked to a NewHire", which counted a
 * declined offer as a hire and made notHiredSpend read $0.00 against live data.
 * hiredSpend therefore now covers hired candidates' fly-outs as well as hires'
 * trips, and hiredSpend + notHiredSpend + unassigned = totalSpend.
 */
export async function getTravelSpendSummary(): Promise<TravelSpendSummary> {
  const trips = await prisma.travelTrip.findMany({
    where: { status: { not: "CANCELED" } },
    select: {
      id: true,
      newHireId: true,
      candidateId: true,
      purpose: true,
      status: true,
      originAirport: true,
      destinationAirport: true,
      requestedArrival: true,
      orientationDate: true,
      indocStart: true,
      newHire: { select: { id: true, name: true } },
      candidate: { select: { id: true, displayName: true } },
      items: { select: { amount: true } }
    }
  });

  const verdicts = await resolveTravelerHiring(trips);

  let totalSpend = 0;
  let hiredSpend = 0;
  let candidateSpend = 0;
  let notHiredSpend = 0;
  const hiredTravelerIds = new Set<string>();
  const byPurpose = new Map<string, { spend: number; trips: number }>();
  const tripRows: TravelSpendTripRow[] = [];

  for (const trip of trips) {
    const tripTotal = trip.items.reduce((sum, i) => sum + (i.amount ?? 0), 0);
    totalSpend += tripTotal;

    const purpose = byPurpose.get(trip.purpose) ?? { spend: 0, trips: 0 };
    purpose.spend += tripTotal;
    purpose.trips += 1;
    byPurpose.set(trip.purpose, purpose);

    if (trip.candidateId) candidateSpend += tripTotal;

    const verdict = verdicts.get(trip.id);
    const hired = Boolean(verdict?.hired);
    if (hired) {
      hiredSpend += tripTotal;
      if (verdict?.travelerKey) hiredTravelerIds.add(verdict.travelerKey);
    } else if (trip.newHireId || trip.candidateId) {
      // A trip attached to nobody is neither — it stays out of both sides rather
      // than being quietly filed as not-hired spend.
      notHiredSpend += tripTotal;
    }

    const startDate = trip.requestedArrival ?? trip.orientationDate ?? trip.indocStart ?? null;
    tripRows.push({
      tripId: trip.id,
      travelerName: trip.newHire?.name ?? trip.candidate?.displayName ?? "Unassigned",
      travelerHref: trip.newHire
        ? `/people/${trip.newHire.id}`
        : trip.candidate
          ? `/candidates/${trip.candidate.id}`
          : null,
      travelerType: trip.newHire ? "newHire" : trip.candidate ? "candidate" : "unassigned",
      hired,
      purpose: trip.purpose,
      route: [trip.originAirport, trip.destinationAirport].filter(Boolean).join(" → ") || null,
      status: trip.status,
      startsAt: startDate ? startDate.toISOString() : null,
      total: tripTotal
    });
  }

  tripRows.sort((a, b) => b.total - a.total);

  return {
    totalSpend,
    tripCount: trips.length,
    hiredSpend,
    candidateSpend,
    notHiredSpend,
    hiredTravelers: hiredTravelerIds.size,
    // hiredSpend already IS every dollar spent on somebody who was hired, so this
    // is a plain division now. It used to reconstruct hired-candidate spend as
    // (candidateSpend - notHiredSpend), which was only ever right by accident.
    costPerHire: hiredTravelerIds.size > 0 ? hiredSpend / hiredTravelerIds.size : null,
    byPurpose: [...byPurpose.entries()]
      .map(([purpose, v]) => ({ purpose, spend: v.spend, trips: v.trips }))
      .sort((a, b) => b.spend - a.spend),
    trips: tripRows
  };
}

// ---- Spend across the year --------------------------------------------------

export type TravelSpendMonthPoint = {
  /** 0-11. */
  month: number;
  /** "Jan". */
  label: string;
  hired: number;
  notHired: number;
  /** Trips attached to neither a hire nor a candidate — neither side of the split. */
  unassigned: number;
  total: number;
  trips: number;
  /** Of those trips, how many landed in this month by a fallback date. */
  inferred: number;
};

export type TravelSpendYearSeries = {
  year: number;
  /** Always 12, January to December, zero-filled. */
  months: TravelSpendMonthPoint[];
  hired: number;
  notHired: number;
  unassigned: number;
  total: number;
  tripCount: number;
  hiredTravelers: number;
  notHiredTravelers: number;
  /** Trips with no travel dates of their own, placed by a fallback. */
  inferredTrips: number;
  /** Booked items carrying no amount, so every total above is a FLOOR. */
  itemsMissingCost: number;
};

export type TravelSpendByMonth = {
  /** Every year that has travel, oldest first. Empty when nothing is logged. */
  years: TravelSpendYearSeries[];
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * When a trip's spend should be counted, and whether we had to guess.
 *
 * tripStart()'s precedence (requested arrival, orientation date, indoc start) is
 * null on 3 of the 7 live non-canceled trips, so a monthly series built on it
 * alone silently drops a third of the money. Two fallbacks rescue the rest: the
 * earliest booking on the trip, then the day the trip was logged. Callers show
 * the count of inferred trips rather than pretending all of this is trip dates.
 */
function tripSpendMonth(trip: {
  requestedArrival: Date | null;
  orientationDate: Date | null;
  indocStart: Date | null;
  createdAt: Date;
  items: { startsAt: Date | null }[];
}): { year: number; month: number; inferred: boolean } {
  const own = trip.requestedArrival ?? trip.orientationDate ?? trip.indocStart ?? null;
  let at = own;
  if (!at) {
    const starts = trip.items.map((i) => i.startsAt).filter((d): d is Date => Boolean(d));
    at = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null;
  }
  if (!at) at = trip.createdAt;
  // dayKeyOf, NOT officeDayKey, and the difference is a whole month on live data.
  // These columns hold BOTH kinds of value: requestedArrival and an item's
  // startsAt are moments, while orientationDate and indocStart are calendar days
  // written at midnight UTC. Read a calendar day in Mountain time and it lands at
  // 6pm the previous day — Dayten Schureman's Sep 1 orientation trip bucketed
  // into August. dayKeyOf chooses per value, the way the travel calendars do.
  const key = dayKeyOf(at);
  return { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) - 1, inferred: !own };
}

/**
 * Travel spend by month, split hired vs not hired — the "what did the year cost,
 * and how much of it was on people we did not hire" question.
 *
 * Same "hired" rule as getTravelSpendSummary (travelerWasHired), so the Travel
 * page and the Reports panel cannot disagree. CANCELED trips are excluded, as
 * they are everywhere else money is totalled.
 */
export async function getTravelSpendByMonth(): Promise<TravelSpendByMonth> {
  const trips = await prisma.travelTrip.findMany({
    where: { status: { not: "CANCELED" } },
    select: {
      id: true,
      newHireId: true,
      candidateId: true,
      requestedArrival: true,
      orientationDate: true,
      indocStart: true,
      createdAt: true,
      items: { select: { amount: true, startsAt: true } }
    }
  });

  const verdicts = await resolveTravelerHiring(trips);

  const byYear = new Map<
    number,
    {
      months: TravelSpendMonthPoint[];
      tripCount: number;
      inferredTrips: number;
      itemsMissingCost: number;
      hiredTravelers: Set<string>;
      notHiredTravelers: Set<string>;
    }
  >();

  for (const trip of trips) {
    const total = trip.items.reduce((sum, i) => sum + (i.amount ?? 0), 0);
    const { year, month, inferred } = tripSpendMonth(trip);
    const verdict = verdicts.get(trip.id);
    const attached = Boolean(trip.newHireId || trip.candidateId);
    const hired = Boolean(verdict?.hired);

    const bucket =
      byYear.get(year) ??
      {
        months: MONTH_LABELS.map((label, i) => ({
          month: i,
          label,
          hired: 0,
          notHired: 0,
          unassigned: 0,
          total: 0,
          trips: 0,
          inferred: 0
        })),
        tripCount: 0,
        inferredTrips: 0,
        itemsMissingCost: 0,
        hiredTravelers: new Set<string>(),
        notHiredTravelers: new Set<string>()
      };
    byYear.set(year, bucket);

    const point = bucket.months[month];
    if (hired) point.hired += total;
    else if (attached) point.notHired += total;
    else point.unassigned += total;
    point.total += total;
    point.trips += 1;
    if (inferred) point.inferred += 1;

    bucket.tripCount += 1;
    if (inferred) bucket.inferredTrips += 1;
    bucket.itemsMissingCost += trip.items.filter((i) => i.amount === null).length;
    if (verdict?.travelerKey) {
      (hired ? bucket.hiredTravelers : bucket.notHiredTravelers).add(verdict.travelerKey);
    }
  }

  const years: TravelSpendYearSeries[] = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, b]) => ({
      year,
      months: b.months,
      hired: b.months.reduce((s, m) => s + m.hired, 0),
      notHired: b.months.reduce((s, m) => s + m.notHired, 0),
      unassigned: b.months.reduce((s, m) => s + m.unassigned, 0),
      total: b.months.reduce((s, m) => s + m.total, 0),
      tripCount: b.tripCount,
      // A traveler whose fly-out was not hired and whose later trip was (which
      // cannot happen today, but could) is counted on the hired side only.
      hiredTravelers: b.hiredTravelers.size,
      notHiredTravelers: [...b.notHiredTravelers].filter((k) => !b.hiredTravelers.has(k)).length,
      inferredTrips: b.inferredTrips,
      itemsMissingCost: b.itemsMissingCost
    }));

  return { years };
}

// ---- Checklist roll-up ------------------------------------------------------

/**
 * Every trip's checklist, rolled into one list — the answer to "is anything
 * about to be missed?" without opening trips one at a time.
 *
 * CANCELED trips are excluded (nothing about a cancelled trip is outstanding);
 * COMPLETED ones are kept, because the after-the-trip items — the day-after
 * check-in and reimbursement — only come due once a trip is over, and those are
 * precisely the steps that get forgotten.
 */
export async function getTravelChecklistRollup(): Promise<TravelChecklistRollup> {
  const [trips, all] = await Promise.all([
    prisma.travelTrip.findMany({
      where: { status: { not: "CANCELED" } },
      include: {
        ...tripInclude,
        newHire: { select: { id: true, name: true } },
        candidate: { select: { id: true, displayName: true } }
      }
    }),
    getAllChecklists()
  ]);

  return buildTravelChecklistRollup(
    trips.map((t) => ({
      trip: toTravelTripView(t as TripWithRelations),
      travelerName: t.newHire?.name ?? t.candidate?.displayName ?? "Unknown traveler",
      travelerHref: t.newHire ? `/people/${t.newHire.id}` : `/candidates/${t.candidate?.id ?? ""}`
    })),
    all
  );
}

/**
 * The same roll-up for ONE person's trips, for the Checklists tab on their
 * profile. Reuses the shared builder so the profile and the Travel page can
 * never disagree about what is outstanding.
 */
export async function getChecklistRollupForTrips(
  trips: TravelTripView[],
  travelerName: string,
  travelerHref: string
): Promise<TravelChecklistRollup> {
  const all = await getAllChecklists();
  return buildTravelChecklistRollup(
    trips.filter((t) => t.status !== "CANCELED").map((trip) => ({ trip, travelerName, travelerHref })),
    all
  );
}
