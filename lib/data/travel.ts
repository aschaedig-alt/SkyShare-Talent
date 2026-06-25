import { prisma } from "@/lib/prisma";

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
  notes: string | null;
  bookedBy: string | null;
  createdAt: string;
  updatedAt: string;
  items: TravelItemView[];
  receipts: TravelReceiptView[];
  /** Sum of item amounts. */
  total: number;
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
      currency: i.currency
    })),
    receipts: t.receipts.map((r) => ({
      id: r.id,
      displayFilename: r.displayFilename,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      amount: r.amount,
      uploadedAt: r.uploadedAt.toISOString()
    })),
    total: t.items.reduce((sum, i) => sum + (i.amount ?? 0), 0)
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

export type TravelHubData = {
  rows: TravelHubRow[];
  stats: { tripCount: number; needsBooking: number; booked: number; totalSpend: number };
};

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
  return {
    rows,
    stats: {
      tripCount: rows.length,
      needsBooking: rows.filter((r) => r.status === "NEEDED").length,
      booked: rows.filter((r) => r.status === "BOOKED" || r.status === "COMPLETED").length,
      totalSpend: active.reduce((sum, r) => sum + r.total, 0)
    }
  };
}

// ---- Reporting --------------------------------------------------------------

export type TravelSpendSummary = {
  totalSpend: number;
  tripCount: number;
  hiredSpend: number; // trips attached to new hires
  candidateSpend: number; // trips attached to candidates (incl. those not hired)
  notHiredSpend: number; // candidate trips where the candidate was not hired
  costPerHire: number | null; // hiredSpend / distinct hired travelers
  hiredTravelers: number;
  byPurpose: { purpose: string; spend: number; trips: number }[];
};

// Roll up all booked travel spend for budgets. "Hired" = trip linked to a
// NewHire; candidate trips split into hired-later vs. not-hired by whether the
// candidate converted to a NewHire (NewHire.candidateId).
export async function getTravelSpendSummary(): Promise<TravelSpendSummary> {
  const trips = await prisma.travelTrip.findMany({
    where: { status: { not: "CANCELED" } },
    select: {
      newHireId: true,
      candidateId: true,
      purpose: true,
      items: { select: { amount: true } }
    }
  });

  // Which candidates eventually became hires?
  const hiredCandidateIds = new Set(
    (await prisma.newHire.findMany({ where: { candidateId: { not: null } }, select: { candidateId: true } }))
      .map((h) => h.candidateId)
      .filter((id): id is string => Boolean(id))
  );

  let totalSpend = 0;
  let hiredSpend = 0;
  let candidateSpend = 0;
  let notHiredSpend = 0;
  const hiredTravelerIds = new Set<string>();
  const byPurpose = new Map<string, { spend: number; trips: number }>();

  for (const trip of trips) {
    const tripTotal = trip.items.reduce((sum, i) => sum + (i.amount ?? 0), 0);
    totalSpend += tripTotal;

    const purpose = byPurpose.get(trip.purpose) ?? { spend: 0, trips: 0 };
    purpose.spend += tripTotal;
    purpose.trips += 1;
    byPurpose.set(trip.purpose, purpose);

    if (trip.newHireId) {
      hiredSpend += tripTotal;
      hiredTravelerIds.add(trip.newHireId);
    } else if (trip.candidateId) {
      candidateSpend += tripTotal;
      if (hiredCandidateIds.has(trip.candidateId)) {
        // Candidate fly-out for someone who was ultimately hired.
        hiredTravelerIds.add(`cand:${trip.candidateId}`);
      } else {
        notHiredSpend += tripTotal;
      }
    }
  }

  return {
    totalSpend,
    tripCount: trips.length,
    hiredSpend,
    candidateSpend,
    notHiredSpend,
    hiredTravelers: hiredTravelerIds.size,
    costPerHire: hiredTravelerIds.size > 0 ? (hiredSpend + (candidateSpend - notHiredSpend)) / hiredTravelerIds.size : null,
    byPurpose: [...byPurpose.entries()]
      .map(([purpose, v]) => ({ purpose, spend: v.spend, trips: v.trips }))
      .sort((a, b) => b.spend - a.spend)
  };
}
