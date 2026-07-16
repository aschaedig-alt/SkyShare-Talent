"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAuthRequired } from "@/lib/auth/auth-config";
import { hasPermission, isRoleName } from "@/lib/auth/roles";
import {
  isTravelItemType,
  isTravelPurpose,
  isTravelReimbursement,
  isTravelStatus
} from "@/lib/travel/constants";
import { parseTravelConfirmation, type ParsedTravel } from "@/lib/extraction/travel-confirmation";
import {
  getTravelTripView,
  getNewHireLoyalty,
  getCandidateLoyalty,
  toTravelTripView,
  type TravelItemView,
  type TravelTripView,
  type TravelerLoyalty
} from "@/lib/data/travel";

export type TripResult = { ok: boolean; error?: string; trip?: TravelTripView };
export type ItemResult = { ok: boolean; error?: string; item?: TravelItemView };
export type SimpleResult = { ok: boolean; error?: string };

// Recruiters + admins (who manage talent records) may edit travel.
async function canEditTravel(): Promise<boolean> {
  if (!isAuthRequired()) return true;
  const session = await getServerSession(authOptions).catch(() => null);
  const role = session?.user?.role;
  return isRoleName(role) && hasPermission(role, "candidates:write");
}

async function actorLabel(): Promise<string | null> {
  if (!isAuthRequired()) return null;
  const session = await getServerSession(authOptions).catch(() => null);
  return session?.user?.email ?? session?.user?.name ?? null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const itemView = (i: {
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
}): TravelItemView => ({
  id: i.id,
  type: i.type,
  vendor: i.vendor,
  confirmation: i.confirmation,
  detail: i.detail,
  startsAt: i.startsAt ? i.startsAt.toISOString() : null,
  endsAt: i.endsAt ? i.endsAt.toISOString() : null,
  amount: i.amount,
  currency: i.currency,
  selfBooked: i.selfBooked,
  reimbursement: i.reimbursement
});

export async function createTrip(input: {
  newHireId?: string | null;
  candidateId?: string | null;
  purpose?: string;
}): Promise<TripResult> {
  if (!(await canEditTravel())) return { ok: false, error: "You do not have permission to edit travel." };

  const newHireId = cleanString(input.newHireId);
  const candidateId = cleanString(input.candidateId);
  if (!newHireId && !candidateId) return { ok: false, error: "A trip must be linked to a hire or candidate." };
  if (newHireId && candidateId) return { ok: false, error: "A trip links to either a hire or a candidate, not both." };

  const purpose = isTravelPurpose(input.purpose) ? input.purpose : "ORIENTATION";

  // Auto-pull the traveler's saved loyalty numbers onto the new trip so they
  // are already there and don't have to be looked up or re-typed.
  const loyalty = newHireId
    ? await getNewHireLoyalty(newHireId)
    : await getCandidateLoyalty(candidateId!);

  const trip = await prisma.travelTrip.create({
    data: {
      newHireId,
      candidateId,
      purpose,
      bookedBy: await actorLabel(),
      frequentFlyer: loyalty.frequentFlyer,
      hotelLoyalty: loyalty.hotelLoyalty,
      rentalLoyalty: loyalty.rentalLoyalty
    },
    include: { items: true, receipts: true }
  });
  return { ok: true, trip: toTravelTripView(trip) };
}

// Save the traveler's loyalty numbers to their profile (NewHire or Candidate).
// New trips auto-pull these; existing trips keep their snapshot.
export async function saveTravelerLoyalty(input: {
  newHireId?: string | null;
  candidateId?: string | null;
  frequentFlyer?: unknown;
  hotelLoyalty?: unknown;
  rentalLoyalty?: unknown;
}): Promise<{ ok: boolean; error?: string; loyalty?: TravelerLoyalty }> {
  if (!(await canEditTravel())) return { ok: false, error: "You do not have permission to edit travel." };

  const newHireId = cleanString(input.newHireId);
  const candidateId = cleanString(input.candidateId);
  if (!newHireId && !candidateId) return { ok: false, error: "Missing traveler." };

  const data: Record<string, string | null> = {};
  if ("frequentFlyer" in input) data.frequentFlyer = cleanString(input.frequentFlyer);
  if ("hotelLoyalty" in input) data.hotelLoyalty = cleanString(input.hotelLoyalty);
  if ("rentalLoyalty" in input) data.rentalLoyalty = cleanString(input.rentalLoyalty);

  const select = { frequentFlyer: true, hotelLoyalty: true, rentalLoyalty: true } as const;
  const updated = newHireId
    ? await prisma.newHire.update({ where: { id: newHireId }, data, select })
    : await prisma.candidate.update({ where: { id: candidateId! }, data, select });

  return { ok: true, loyalty: updated };
}

const TRIP_STRING_FIELDS = [
  "originAirport",
  "destinationAirport",
  "preferredAirline",
  "frequentFlyer",
  "hotelLoyalty",
  "rentalLoyalty",
  "preferences",
  "additionalTransport",
  "specialRequests",
  "notes",
  "bookedBy"
] as const;

const TRIP_DATE_FIELDS = [
  "orientationDate",
  "indocStart",
  "indocEnd",
  "requestedArrival",
  "requestedReturn"
] as const;

export async function updateTrip(tripId: string, patch: Record<string, unknown>): Promise<TripResult> {
  if (!(await canEditTravel())) return { ok: false, error: "You do not have permission to edit travel." };

  const data: Record<string, unknown> = {};
  if ("purpose" in patch && isTravelPurpose(patch.purpose)) data.purpose = patch.purpose;
  if ("status" in patch && isTravelStatus(patch.status)) data.status = patch.status;
  for (const key of TRIP_STRING_FIELDS) {
    if (key in patch) data[key] = cleanString(patch[key]);
  }
  for (const key of TRIP_DATE_FIELDS) {
    if (key in patch) data[key] = parseDate(patch[key]);
  }
  // Guest names travelling with the traveller. Trimmed, de-duped, capped.
  if ("guests" in patch && Array.isArray(patch.guests)) {
    const names = patch.guests
      .map((g) => (typeof g === "string" ? g.trim() : ""))
      .filter((g) => g.length > 0 && g.length <= 120);
    data.guests = [...new Set(names)].slice(0, 20);
  }

  if (Object.keys(data).length === 0) {
    const trip = await getTravelTripView(tripId);
    return trip ? { ok: true, trip } : { ok: false, error: "Trip not found." };
  }

  const trip = await prisma.travelTrip.update({
    where: { id: tripId },
    data,
    include: { items: { orderBy: { startsAt: "asc" } }, receipts: { orderBy: { uploadedAt: "desc" } } }
  });
  return { ok: true, trip: toTravelTripView(trip) };
}

export async function deleteTrip(tripId: string): Promise<SimpleResult> {
  if (!(await canEditTravel())) return { ok: false, error: "You do not have permission to edit travel." };
  await prisma.travelTrip.delete({ where: { id: tripId } });
  return { ok: true };
}

export async function addItem(tripId: string, input: { type?: string }): Promise<ItemResult> {
  if (!(await canEditTravel())) return { ok: false, error: "You do not have permission to edit travel." };
  const type = isTravelItemType(input.type) ? input.type : "FLIGHT";
  const item = await prisma.travelItem.create({ data: { tripId, type } });
  return { ok: true, item: itemView(item) };
}

export async function updateItem(itemId: string, patch: Record<string, unknown>): Promise<ItemResult> {
  if (!(await canEditTravel())) return { ok: false, error: "You do not have permission to edit travel." };

  const data: Record<string, unknown> = {};
  if ("type" in patch && isTravelItemType(patch.type)) data.type = patch.type;
  if ("vendor" in patch) data.vendor = cleanString(patch.vendor);
  if ("confirmation" in patch) data.confirmation = cleanString(patch.confirmation);
  if ("detail" in patch) data.detail = cleanString(patch.detail);
  if ("startsAt" in patch) data.startsAt = parseDate(patch.startsAt);
  if ("endsAt" in patch) data.endsAt = parseDate(patch.endsAt);
  if ("amount" in patch) data.amount = parseAmount(patch.amount);
  if ("currency" in patch && cleanString(patch.currency)) data.currency = cleanString(patch.currency);
  if ("selfBooked" in patch && typeof patch.selfBooked === "boolean") {
    data.selfBooked = patch.selfBooked;
    // Un-ticking self-booked means we booked it, so there is nothing to pay back.
    if (!patch.selfBooked) data.reimbursement = "NOT_NEEDED";
  }
  if ("reimbursement" in patch && isTravelReimbursement(patch.reimbursement)) {
    data.reimbursement = patch.reimbursement;
  }

  const item = await prisma.travelItem.update({ where: { id: itemId }, data });
  return { ok: true, item: itemView(item) };
}

export async function deleteItem(itemId: string): Promise<SimpleResult> {
  if (!(await canEditTravel())) return { ok: false, error: "You do not have permission to edit travel." };
  await prisma.travelItem.delete({ where: { id: itemId } });
  return { ok: true };
}

// Parse a pasted confirmation / itinerary into suggested items + trip fields.
// Pure read: writes nothing. The client reviews the suggestions, then applies
// them with the normal addItem / updateItem / updateTrip actions.
export async function extractTravelConfirmation(
  text: string
): Promise<{ ok: boolean; error?: string; parsed?: ParsedTravel }> {
  if (!(await canEditTravel())) return { ok: false, error: "You do not have permission to edit travel." };
  if (typeof text !== "string" || text.trim().length < 8) {
    return { ok: false, error: "Paste a bit more of the confirmation to extract from." };
  }
  return { ok: true, parsed: parseTravelConfirmation(text) };
}
