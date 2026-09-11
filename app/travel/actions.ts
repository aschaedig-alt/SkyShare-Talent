"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAuthRequired } from "@/lib/auth/auth-config";
import { hasPermission, isRoleName } from "@/lib/auth/roles";
import {
  formatUsd,
  isTravelItemType,
  isTravelPurpose,
  isTravelReimbursement,
  isTravelStatus,
  ONBOARDING_TRAVEL_PURPOSES
} from "@/lib/travel/constants";
import { getOrientationChannelId, ORIENTATION_CHANNEL_ADDRESS } from "@/lib/front/config";
import { sendEmail, type SentMessage } from "@/lib/front/messages";
import { guardDecision } from "@/lib/front/send-guard";
import {
  buildTravelReimbursementEmail,
  getReimbursementSendRecord,
  getReimbursementTemplate,
  recordReimbursementSend,
  setReimbursementTemplate,
  type ReimbursementEmailPreview,
  type ReimbursementSendRecord,
  type TravelerForReimbursementEmail
} from "@/lib/front/travel-reimbursement-email";
import { parseTravelConfirmation, type ParsedTravel } from "@/lib/extraction/travel-confirmation";
import {
  isChecklistStatus,
  isNotNeededGroup,
  isReimbursementStage,
  isVisitField,
  type TripChecklistState
} from "@/lib/travel/checklist";
import { clearTripChecklist, getTripChecklist, saveTripChecklist } from "@/lib/travel/checklist-store";
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

  // Booking a hire's trip means their travel is arranged, so tick the onboarding
  // checklist's "Travel accommodations complete" — otherwise a fully-handled hire
  // sits at "N-1/N" forever because nothing else sets this task. Forward-only: we
  // do not auto-untick on cancel (a hire can have several trips, and clobbering a
  // hand-set value is worse than a rare stale tick). Candidate fly-out trips have
  // no NewHire, so they are skipped.
  //
  // ONLY ONBOARDING PURPOSES TICK IT. This was unfiltered, and only safe because
  // the non-onboarding purposes all happened to attach to a candidate rather
  // than a hire. Crew travel is booked for people who ARE hires, so booking a
  // pilot's line trip would otherwise have marked their orientation travel
  // arranged. See ONBOARDING_TRAVEL_PURPOSES.
  if (
    (data.status === "BOOKED" || data.status === "COMPLETED") &&
    trip.newHireId &&
    (ONBOARDING_TRAVEL_PURPOSES as readonly string[]).includes(trip.purpose)
  ) {
    await prisma.onboardingTask.updateMany({
      where: { newHireId: trip.newHireId, key: "travel_complete", status: { not: "DONE" } },
      data: { status: "DONE", completedAt: new Date() }
    });
  }

  return { ok: true, trip: toTravelTripView(trip) };
}

export async function deleteTrip(tripId: string): Promise<SimpleResult> {
  if (!(await canEditTravel())) return { ok: false, error: "You do not have permission to edit travel." };
  await prisma.travelTrip.delete({ where: { id: tripId } });
  // Checklist state is not a database relation, so nothing cascades it — clear
  // it here or a new trip could inherit a dead trip's ticks if an id repeated.
  await clearTripChecklist(tripId);
  return { ok: true };
}

// --- the checklist ----------------------------------------------------------

export type ChecklistResult = { ok: boolean; error?: string; state?: TripChecklistState };

export async function loadChecklist(tripId: string): Promise<ChecklistResult> {
  if (!(await canEditTravel())) return { ok: false, error: "You do not have permission to view travel." };
  return { ok: true, state: await getTripChecklist(tripId) };
}

/**
 * Move one item to To do, Done or N/A. Records WHO and WHEN, because "did
 * anyone actually tell the supervisor" is the question this checklist exists to
 * answer, and a bare checkmark cannot answer it.
 *
 * N/A is stamped with the same who-and-when as a completion on purpose: deciding
 * an item does not apply to a trip is a call somebody made, and the next person
 * looking at it deserves to know who made it.
 */
export async function setChecklistStatus(tripId: string, key: string, status: string): Promise<ChecklistResult> {
  if (!(await canEditTravel())) return { ok: false, error: "You do not have permission to edit travel." };
  if (typeof key !== "string" || !key.trim()) return { ok: false, error: "Missing item." };
  if (!isChecklistStatus(status)) return { ok: false, error: "Unknown status." };
  const state = await saveTripChecklist(tripId, {
    ticks: { [key]: { status, at: new Date().toISOString(), by: await actorLabel() } }
  });
  return { ok: true, state };
}

export async function setVisitField(tripId: string, field: string, value: string): Promise<ChecklistResult> {
  if (!(await canEditTravel())) return { ok: false, error: "You do not have permission to edit travel." };
  if (!isVisitField(field)) return { ok: false, error: "Unknown field." };
  const state = await saveTripChecklist(tripId, { visit: { [field]: value.trim() } });
  return { ok: true, state };
}

/**
 * Mark a group of request-detail fields as one this trip does not have, or put
 * it back. Nothing on the trip is cleared — the values, if any, stay exactly
 * where they are and reappear when the group is restored.
 */
export async function setFieldGroupNotNeeded(
  tripId: string,
  group: string,
  notNeeded: boolean
): Promise<ChecklistResult> {
  if (!(await canEditTravel())) return { ok: false, error: "You do not have permission to edit travel." };
  if (!isNotNeededGroup(group)) return { ok: false, error: "Unknown field group." };
  if (typeof notNeeded !== "boolean") return { ok: false, error: "Expected true or false." };
  const state = await saveTripChecklist(tripId, { notNeeded: { [group]: notNeeded } });
  return { ok: true, state };
}

export async function setReimbursementStage(tripId: string, stage: string): Promise<ChecklistResult> {
  if (!(await canEditTravel())) return { ok: false, error: "You do not have permission to edit travel." };
  if (!isReimbursementStage(stage)) return { ok: false, error: "Unknown stage." };
  const state = await saveTripChecklist(tripId, { reimbursement: stage });
  return { ok: true, state };
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

// ---------------------------------------------------------------------------
// "Are you still owed any reimbursements?" — the email to the traveler.
//
// Two-step, preview then send, for the same reason every other send in this app
// is: it is irreversible and lands in a real person's inbox. The body is editable
// for one send and nothing is written back to Front.
//
// It records the send and NOTHING ELSE. It does not advance the reimbursement
// stage: NOT_STARTED → SUBMITTED → TRAVELER_TOLD → PAYMENT_CONFIRMED →
// TRAVELER_CONFIRMED, and asking whether anything is still outstanding is none of
// those — it is the question you ask before you know. Ticking one of them off the
// back of a question would put a stage on the trip that nobody reached.

export type ReimbursementEmailPreviewResult = {
  ok: boolean;
  error?: string;
  preview?: ReimbursementEmailPreview;
  alreadySent?: ReimbursementSendRecord | null;
  /** Returned even when the preview FAILED — the dialog's template picker needs
   *  it to preselect, and the commonest failure is "no template picked yet",
   *  which that picker is the fix for. */
  template?: { templateId: string; templateName: string } | null;
  travelerName?: string;
  /** A context line for the dialog: how much this trip still shows as owed. */
  owedNote?: string;
};

export type ReimbursementEmailSendResult = {
  ok: boolean;
  error?: string;
  to?: string;
  sentAt?: string;
  conversationId?: string;
  warnings?: string[];
  /** True when this was a dry run to hrotasks@ rather than a real send. The
   *  caller MUST read it: a test must not be described as a delivered email and
   *  nothing about it is recorded. */
  test?: boolean;
};

export type ReimbursementEmailStatus = {
  ok: boolean;
  error?: string;
  sent?: ReimbursementSendRecord | null;
  hasTemplate?: boolean;
};

/**
 * Who the trip is for. A trip attaches to EITHER a NewHire or a Candidate, and a
 * candidate has no NewHire row at all — which is the specific reason the people
 * module's SendTaskEmailButton could not be reused here.
 */
async function loadTripTraveler(
  tripId: string
): Promise<
  | { ok: true; trip: TravelTripView; traveler: TravelerForReimbursementEmail }
  | { ok: false; error: string }
> {
  const trip = await getTravelTripView(tripId);
  if (!trip) return { ok: false, error: "That trip no longer exists." };

  if (trip.newHireId) {
    const hire = await prisma.newHire.findUnique({
      where: { id: trip.newHireId },
      select: { name: true, ssEmail: true, personalEmail: true }
    });
    if (!hire) return { ok: false, error: "This trip points at a new hire record that no longer exists." };
    return {
      ok: true,
      trip,
      traveler: { kind: "hire", name: hire.name, companyEmail: hire.ssEmail, personalEmail: hire.personalEmail }
    };
  }

  if (trip.candidateId) {
    const candidate = await prisma.candidate.findUnique({
      where: { id: trip.candidateId },
      select: { displayName: true, primaryEmail: true }
    });
    if (!candidate) return { ok: false, error: "This trip points at a candidate record that no longer exists." };
    return {
      ok: true,
      trip,
      traveler: {
        kind: "candidate",
        name: candidate.displayName,
        companyEmail: null,
        personalEmail: candidate.primaryEmail
      }
    };
  }

  return { ok: false, error: "This trip has nobody attached to it, so there is no one to email." };
}

function owedNoteFor(trip: TravelTripView): string | undefined {
  const paid = trip.items.filter((i) => i.selfBooked || i.reimbursement === "NEEDED").length;
  if (paid === 0) return undefined;
  return (
    `${paid} item${paid === 1 ? "" : "s"} on this trip ${paid === 1 ? "was" : "were"} paid for by the traveler, ` +
    `${formatUsd(trip.reimbursementOwed)} of it still marked as owed. The email does not quote an amount — ` +
    `it asks whether anything is still outstanding.`
  );
}

/** Remember which Front template this email sends. Picked in the send window, so
 *  the day she creates the template in Front the feature works — no deploy. */
export async function saveReimbursementTemplate(templateId: string, templateName: string): Promise<SimpleResult> {
  if (!(await canEditTravel())) return { ok: false, error: "You do not have permission to edit travel." };
  if (typeof templateId !== "string" || !templateId.trim()) return { ok: false, error: "Pick a template first." };
  await setReimbursementTemplate({
    templateId: templateId.trim(),
    templateName: typeof templateName === "string" && templateName.trim() ? templateName.trim() : templateId.trim(),
    // hrotasks@ is copied on every send in this app, so the thread is findable by
    // somebody other than whoever pressed the button.
    cc: [ORIENTATION_CHANNEL_ADDRESS]
  });
  return { ok: true };
}

/** Has this trip already been asked, and is a template set at all. Read by the
 *  button so it can say "Asked <date>" without opening the dialog. */
export async function getReimbursementEmailStatus(tripId: string): Promise<ReimbursementEmailStatus> {
  if (!(await canEditTravel())) return { ok: false, error: "You do not have permission to view travel." };
  const [sent, cfg] = await Promise.all([getReimbursementSendRecord(tripId), getReimbursementTemplate()]);
  return { ok: true, sent, hasTemplate: Boolean(cfg) };
}

/** Build (but do not send) the email, plus whether one already went out. */
export async function previewReimbursementEmail(tripId: string): Promise<ReimbursementEmailPreviewResult> {
  if (!(await canEditTravel())) return { ok: false, error: "You do not have permission to send this email." };

  const cfg = await getReimbursementTemplate();
  const template = cfg ? { templateId: cfg.templateId, templateName: cfg.templateName } : null;

  const loaded = await loadTripTraveler(tripId);
  // tsconfig has strict:false, so a boolean discriminant does not narrow a union.
  // The cast is this codebase's own idiom for it — see app/api/new-hires/[id]/route.ts:30.
  if (!loaded.ok) return { ok: false, error: (loaded as { ok: false; error: string }).error, template };

  try {
    const [preview, alreadySent] = await Promise.all([
      buildTravelReimbursementEmail(loaded.traveler),
      getReimbursementSendRecord(tripId)
    ]);
    return {
      ok: true,
      preview,
      alreadySent,
      template,
      travelerName: loaded.traveler.name,
      owedNote: owedNoteFor(loaded.trip)
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not build the email.",
      template,
      travelerName: loaded.traveler.name
    };
  }
}

/**
 * Send it. Rebuilds from the same code path the preview used, so what was
 * approved is what goes out — including re-reading the live Front template, so an
 * edit made in Front between preview and send is not silently ignored.
 *
 * bodyOverride is the wording she typed in the dialog. It applies to THIS SEND
 * ONLY: nothing is written back to Front, and the next send reads the template
 * fresh. An untouched body arrives here as null and is never sent back at all.
 *
 * opts.test is "send it to me first" — the same shape the checklist-task email
 * grew on 2026-09-10. It works because the greeting is built from the TRAVELER'S
 * NAME and not from the recipient address, so swapping the address after the
 * email has been built leaves "Hi Charlie," exactly where it was. A test writes
 * no send record, because a record is a claim the traveler was asked, and that
 * would not be true. It also drops cc: the send guard only passes a message
 * through untouched when EVERY recipient is an internal mailbox, so one human in
 * cc would change what was actually sent.
 */
export async function sendReimbursementEmail(
  tripId: string,
  bodyOverride?: string | null,
  opts?: { test?: boolean }
): Promise<ReimbursementEmailSendResult> {
  if (!(await canEditTravel())) return { ok: false, error: "You do not have permission to send this email." };

  const loaded = await loadTripTraveler(tripId);
  // See the note in previewReimbursementEmail — strict:false means no narrowing.
  if (!loaded.ok) return { ok: false, error: (loaded as { ok: false; error: string }).error };

  // STEP 1 — everything that can still be retried safely. A throw here means
  // nothing left the building.
  let email: ReimbursementEmailPreview;
  let channelId: string;
  try {
    email = await buildTravelReimbursementEmail(loaded.traveler, bodyOverride);
    channelId = await getOrientationChannelId();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not build the email." };
  }

  // The one place the addresses are decided. Everything below reads these and
  // never email.to/cc/subject again — if the guard, the recorded label and the
  // Front payload could disagree, the record would lie about what was sent.
  const asTest = opts?.test === true;
  const intendedLabel = email.to.join(", ") || "nobody";
  const toList = asTest ? [ORIENTATION_CHANNEL_ADDRESS] : email.to;
  const ccList = asTest ? [] : email.cc;
  // Several tests for several travelers land in the same shared inbox, so the
  // subject has to say which one this is and who it would really have gone to.
  const subject = asTest ? `[TEST — would have gone to ${intendedLabel}] ${email.subject}` : email.subject;

  // Outside production every recipient is rewritten to FRONT_TEST_INBOX and the
  // send still succeeds — so without asking, this would record the traveler's real
  // address for a message they never received.
  const guard = guardDecision({ to: toList, cc: ccList, subject });
  const toLabel = toList.join(", ");

  // STEP 2 — the irreversible one, alone in its own try. Nothing else may share
  // it: a failure in the bookkeeping below must never be reported as "Send
  // failed", because that reads as "nothing went out" and invites a second REAL
  // send.
  let sent: SentMessage;
  try {
    sent = await sendEmail(channelId, {
      to: toList,
      cc: ccList,
      subject,
      // email.html is the greeting + body, unchanged by the test path. That is the
      // whole point: what lands in hrotasks@ is the email the person would get.
      body: email.html,
      archive: false
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Send failed." };
  }

  // STEP 3 — bookkeeping. The email is already gone; from here every outcome is a
  // success with a caveat, never a failure.
  const sentAt = new Date().toISOString();
  const warnings: string[] = [];

  // A test addressed only to hrotasks@ comes back "internal", which is not a
  // caveat — it is the mode that means the message went exactly where it was
  // addressed, in dev and in production alike.
  if (guard.mode !== "production" && !(asTest && guard.mode === "internal")) {
    warnings.push(
      `This is not the production environment, so the message was ${
        guard.mode === "redirected" ? "redirected to the test inbox" : `handled as "${guard.mode}"`
      } rather than delivered to ${toLabel}.`
    );
  }

  if (asTest) {
    // Loud, and on a success, because the whole failure mode here is a test that
    // is mistaken for the real send.
    warnings.push(
      `Test send. It went to ${ORIENTATION_CHANNEL_ADDRESS} with a [TEST] subject line, not to ${intendedLabel}. Nothing was recorded, so this does not count as asked — send it for real when the wording looks right.`
    );
  }

  if (!asTest) {
    try {
      await recordReimbursementSend(tripId, {
        conversationId: sent.conversationId,
        messageId: sent.id,
        sentAt,
        to: toLabel,
        sentBy: await actorLabel(),
        mode: guard.mode,
        edited: email.edited,
        templateName: email.templateName
      });
    } catch {
      warnings.push("The email went out, but the send record could not be saved — a re-send will not warn you.");
    }
  }

  return {
    ok: true,
    to: toLabel,
    sentAt,
    conversationId: sent.conversationId,
    test: asTest,
    ...(warnings.length ? { warnings } : {})
  };
}
